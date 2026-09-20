import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import { PrismaAdministratorPrivilegeRepository } from '../../../src/modules/accounts/infrastructure/persistence/prisma-administrator-privilege.repository.js';
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
];
const ADMIN_ONE_ID = '4a84f480-b1cb-4b81-b632-8bb49034b9e7';
const ADMIN_TWO_ID = '77af9009-08e1-42f5-91d3-516920f0c571';
const STUDENT_ID = '9fa02524-f606-4e1d-8cef-bfa0cf884e3e';
const STUDENT_SESSION_ID = '44190d22-9ee2-4655-b236-451afb0cb225';
const ADMIN_TWO_SESSION_ID = 'a23394c1-c131-4b77-bf0d-c39bc11bf81e';
const NOW = new Date('2026-09-20T08:00:00.000Z');

describe('PrismaAdministratorPrivilegeRepository', () => {
  let container: Awaited<ReturnType<PostgreSqlContainer['start']>>;
  let prisma: PrismaClient;
  let repository: PrismaAdministratorPrivilegeRepository;

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

    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
    });
    await prisma.$connect();
    repository = new PrismaAdministratorPrivilegeRepository(prisma);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE TABLE "users" CASCADE`;
    await prisma.user.createMany({
      data: [
        {
          email: 'admin-one@u.nus.edu',
          id: ADMIN_ONE_ID,
          isAdmin: true,
          passwordHash: 'password-hash',
          phoneNumber: '81111111',
          status: 'ACTIVE',
          username: 'AdminOne',
        },
        {
          email: 'student@u.nus.edu',
          id: STUDENT_ID,
          isAdmin: false,
          passwordHash: 'password-hash',
          phoneNumber: '83333333',
          status: 'ACTIVE',
          username: 'StudentOne',
        },
      ],
    });
  });

  it('promotes a student and revokes every active session atomically', async () => {
    await createSession(prisma, STUDENT_ID, STUDENT_SESSION_ID);

    await expect(
      repository.changeAdministratorPrivilege({
        actorUserId: ADMIN_ONE_ID,
        changedAt: NOW,
        isAdmin: true,
        targetUserId: STUDENT_ID,
      }),
    ).resolves.toMatchObject({ id: STUDENT_ID, isAdmin: true });
    await expect(
      prisma.session.findUnique({ where: { id: STUDENT_SESSION_ID } }),
    ).resolves.toMatchObject({ revokedAt: NOW });
  });

  it('demotes another administrator and revokes their sessions', async () => {
    await createSecondAdministrator(prisma);
    await createSession(prisma, ADMIN_TWO_ID, ADMIN_TWO_SESSION_ID);

    await expect(
      repository.changeAdministratorPrivilege({
        actorUserId: ADMIN_ONE_ID,
        changedAt: NOW,
        isAdmin: false,
        targetUserId: ADMIN_TWO_ID,
      }),
    ).resolves.toMatchObject({ id: ADMIN_TWO_ID, isAdmin: false });
    await expect(
      prisma.session.findUnique({ where: { id: ADMIN_TWO_SESSION_ID } }),
    ).resolves.toMatchObject({ revokedAt: NOW });
  });

  it('serializes opposing demotions so at least one administrator remains', async () => {
    await createSecondAdministrator(prisma);

    const results = await Promise.allSettled([
      repository.changeAdministratorPrivilege({
        actorUserId: ADMIN_ONE_ID,
        changedAt: NOW,
        isAdmin: false,
        targetUserId: ADMIN_TWO_ID,
      }),
      repository.changeAdministratorPrivilege({
        actorUserId: ADMIN_TWO_ID,
        changedAt: NOW,
        isAdmin: false,
        targetUserId: ADMIN_ONE_ID,
      }),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    await expect(prisma.user.count({ where: { isAdmin: true } })).resolves.toBe(
      1,
    );
  });

  it('database protection blocks deletion of the last administrator', async () => {
    await expect(
      prisma.user.delete({ where: { id: ADMIN_ONE_ID } }),
    ).rejects.toBeDefined();
    await expect(prisma.user.count({ where: { isAdmin: true } })).resolves.toBe(
      1,
    );
  });
});

async function createSecondAdministrator(prisma: PrismaClient): Promise<void> {
  await prisma.user.create({
    data: {
      email: 'admin-two@u.nus.edu',
      id: ADMIN_TWO_ID,
      isAdmin: true,
      passwordHash: 'password-hash',
      phoneNumber: '82222222',
      status: 'ACTIVE',
      username: 'AdminTwo',
    },
  });
}

async function createSession(
  prisma: PrismaClient,
  userId: string,
  id: string,
): Promise<void> {
  await prisma.session.create({
    data: {
      expiresAt: new Date(NOW.getTime() + 86_400_000),
      id,
      refreshTokenHash: `${id}-refresh-hash`,
      userId,
    },
  });
}
