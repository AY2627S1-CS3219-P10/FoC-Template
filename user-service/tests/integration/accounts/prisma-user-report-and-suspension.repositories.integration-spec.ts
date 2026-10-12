import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import { PrismaTemporarySuspensionRepository } from '../../../src/modules/accounts/infrastructure/persistence/prisma-temporary-suspension.repository.js';
import { PrismaUserReportRepository } from '../../../src/modules/accounts/infrastructure/persistence/prisma-user-report.repository.js';
import type { Prisma } from '../../../src/generated/prisma/client.js';
import { PrismaClient } from '../../../src/generated/prisma/client.js';

const MIGRATION_PATHS = [
  resolve(
    'prisma/migrations/20260919000100_create_user_identity_tables/migration.sql',
  ),
  resolve(
    'prisma/migrations/20260920000100_enforce_one_active_verification_code/migration.sql',
  ),
  resolve(
    'prisma/migrations/20260920000200_protect_last_administrator/migration.sql',
  ),
  resolve(
    'prisma/migrations/20261012000100_add_user_reports_and_temporary_suspensions/migration.sql',
  ),
];
const ADMIN_ID = '4a84f480-b1cb-4b81-b632-8bb49034b9e7';
const REPORTER_ID = '77af9009-08e1-42f5-91d3-516920f0c571';
const TARGET_ID = '9fa02524-f606-4e1d-8cef-bfa0cf884e3e';
const REPORT_ID = '44190d22-9ee2-4655-b236-451afb0cb225';
const SESSION_ID = 'a23394c1-c131-4b77-bf0d-c39bc11bf81e';
const NOW = new Date('2030-10-12T08:00:00.000Z');

describe('Prisma report and temporary suspension repositories', () => {
  let container: Awaited<ReturnType<PostgreSqlContainer['start']>>;
  let prisma: PrismaClient;
  let reports: PrismaUserReportRepository;
  let suspensions: PrismaTemporarySuspensionRepository;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18-alpine').start();
    const connectionString = container.getConnectionUri();
    const migrationPool = new Pool({ connectionString });
    try {
      for (const migrationPath of MIGRATION_PATHS) {
        await migrationPool.query(await readFile(migrationPath, 'utf8'));
      }
    } finally {
      await migrationPool.end();
    }
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    await prisma.$connect();
    reports = new PrismaUserReportRepository(prisma);
    suspensions = new PrismaTemporarySuspensionRepository(prisma);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE TABLE "users" CASCADE`;
    await prisma.user.createMany({
      data: [
        account(ADMIN_ID, 'admin@u.nus.edu', 'AdminUser', true, '81111111'),
        account(
          REPORTER_ID,
          'reporter@u.nus.edu',
          'ReporterUser',
          false,
          '82222222',
        ),
        account(TARGET_ID, 'target@u.nus.edu', 'TargetUser', false, '83333333'),
      ],
    });
  });

  it('creates, lists, and resolves a report without sensitive account fields', async () => {
    const created = await reports.createReport({
      createdAt: NOW,
      description: 'Repeated abusive messages',
      id: REPORT_ID,
      reportedUserId: TARGET_ID,
      reporterUserId: REPORTER_ID,
    });
    expect(created).toMatchObject({ id: REPORT_ID, status: 'OPEN' });
    expect(created?.reporter).toEqual({
      id: REPORTER_ID,
      username: 'ReporterUser',
    });
    expect(created?.reporter).not.toHaveProperty('email');

    await expect(reports.listReports()).resolves.toHaveLength(1);
    await expect(
      reports.resolveReport({
        reportId: REPORT_ID,
        resolvedAt: new Date(NOW.getTime() + 1_000),
        resolvedByAdminId: ADMIN_ID,
      }),
    ).resolves.toMatchObject({ status: 'RESOLVED' });
  });

  it('returns null when the reported account does not exist', async () => {
    await expect(
      reports.createReport({
        createdAt: NOW,
        description: 'Missing account',
        id: REPORT_ID,
        reportedUserId: '5a84f480-b1cb-4b81-b632-8bb49034b9e7',
        reporterUserId: REPORTER_ID,
      }),
    ).resolves.toBeNull();
  });

  it('suspends a user and revokes every active session atomically', async () => {
    await prisma.session.create({
      data: {
        expiresAt: new Date(NOW.getTime() + 86_400_000),
        id: SESSION_ID,
        refreshTokenHash: 'target-refresh-hash',
        userId: TARGET_ID,
      },
    });
    const suspendedUntil = new Date(NOW.getTime() + 3_600_000);

    await expect(
      suspensions.suspendAccount({
        actorUserId: ADMIN_ID,
        suspendedAt: NOW,
        suspendedUntil,
        targetUserId: TARGET_ID,
      }),
    ).resolves.toMatchObject({ id: TARGET_ID, suspendedUntil });
    await expect(
      prisma.session.findUnique({ where: { id: SESSION_ID } }),
    ).resolves.toMatchObject({ revokedAt: NOW });
  });

  it('preserves the final usable administrator at repository and database levels', async () => {
    await expect(
      suspensions.suspendAccount({
        actorUserId: ADMIN_ID,
        suspendedAt: NOW,
        suspendedUntil: new Date(NOW.getTime() + 3_600_000),
        targetUserId: ADMIN_ID,
      }),
    ).rejects.toMatchObject({ code: 'LAST_ADMINISTRATOR_REQUIRED' });

    await expect(
      prisma.user.update({
        data: { suspendedUntil: new Date('2099-01-01T00:00:00.000Z') },
        where: { id: ADMIN_ID },
      }),
    ).rejects.toBeDefined();
  });
});

function account(
  id: string,
  email: string,
  username: string,
  isAdmin: boolean,
  phoneNumber: string,
): Prisma.UserCreateManyInput {
  return {
    email,
    id,
    isAdmin,
    passwordHash: 'password-hash',
    phoneNumber,
    status: 'ACTIVE' as const,
    username,
  };
}
