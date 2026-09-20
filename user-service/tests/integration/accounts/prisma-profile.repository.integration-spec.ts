import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import { PrismaProfileRepository } from '../../../src/modules/accounts/infrastructure/persistence/prisma-profile.repository.js';
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
const USER_ID = '4a84f480-b1cb-4b81-b632-8bb49034b9e7';
const OTHER_USER_ID = '77af9009-08e1-42f5-91d3-516920f0c571';
const SESSION_ID = 'a23394c1-c131-4b77-bf0d-c39bc11bf81e';
const NOW = new Date('2026-09-20T04:00:00.000Z');

describe('PrismaProfileRepository', () => {
  let container: Awaited<ReturnType<PostgreSqlContainer['start']>>;
  let prisma: PrismaClient;
  let repository: PrismaProfileRepository;

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
    repository = new PrismaProfileRepository(prisma);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
    await prisma.user.createMany({
      data: [
        {
          email: 'student@u.nus.edu',
          id: USER_ID,
          isAdmin: false,
          passwordHash: 'current-password-hash',
          phoneNumber: '91234567',
          status: 'ACTIVE',
          username: 'Arthur3219',
        },
        {
          email: 'other@u.nus.edu',
          id: OTHER_USER_ID,
          isAdmin: false,
          passwordHash: 'other-password-hash',
          phoneNumber: '87654321',
          status: 'ACTIVE',
          username: 'OtherStudent',
        },
      ],
    });
  });

  it('loads a profile and changes its phone number', async () => {
    await expect(repository.findProfileById(USER_ID)).resolves.toMatchObject({
      email: 'student@u.nus.edu',
      id: USER_ID,
      phoneNumber: '91234567',
    });

    await expect(
      repository.updatePhoneNumber(USER_ID, '81112222'),
    ).resolves.toMatchObject({ phoneNumber: '81112222' });
  });

  it('maps a database phone-number conflict to the account error', async () => {
    await expect(
      repository.updatePhoneNumber(USER_ID, '87654321'),
    ).rejects.toMatchObject({
      code: 'PHONE_NUMBER_ALREADY_REGISTERED',
      field: 'phoneNumber',
    });
  });

  it('changes the password and revokes every active session atomically', async () => {
    await prisma.session.create({
      data: {
        expiresAt: new Date(NOW.getTime() + 86_400_000),
        id: SESSION_ID,
        refreshTokenHash: 'refresh-token-hash',
        userId: USER_ID,
      },
    });

    await repository.changePasswordAndRevokeSessions({
      changedAt: NOW,
      passwordHash: 'new-password-hash',
      userId: USER_ID,
    });

    await expect(
      prisma.user.findUnique({ where: { id: USER_ID } }),
    ).resolves.toMatchObject({
      passwordChangedAt: NOW,
      passwordHash: 'new-password-hash',
    });
    await expect(
      prisma.session.findUnique({ where: { id: SESSION_ID } }),
    ).resolves.toMatchObject({ revokedAt: NOW });
  });
});
