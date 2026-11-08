import { readFile } from 'node:fs/promises';

import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import type { TestAccountSeedRecord } from '../../../src/modules/accounts/application/ports/test-account-seed-repository.port.js';
import { AccountStatus } from '../../../src/modules/accounts/domain/account-status.js';
import { PrismaTestAccountSeedRepository } from '../../../src/modules/accounts/infrastructure/persistence/prisma-test-account-seed.repository.js';
import { PrismaClient } from '../../../src/generated/prisma/client.js';

import { MIGRATION_PATHS } from './migration-paths.js';

const NOW = new Date('2026-11-08T12:00:00.000Z');

function makeRecords(count = 11): TestAccountSeedRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    email: `foc-loadtest-${String(index + 1).padStart(2, '0')}@u.nus.edu`,
    emailVerifiedAt: NOW,
    eventId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    isAdmin: false,
    passwordHash: `password-hash-${index + 1}`,
    phoneNumber: `880000${String(index + 1).padStart(2, '0')}`,
    status: AccountStatus.Active,
    username: `FocLoadTest${index + 1}`,
  }));
}

describe('PrismaTestAccountSeedRepository', () => {
  let container: Awaited<ReturnType<PostgreSqlContainer['start']>>;
  let prisma: PrismaClient;
  let repository: PrismaTestAccountSeedRepository;

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
    repository = new PrismaTestAccountSeedRepository(prisma);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE TABLE "users" CASCADE`;
  });

  it('creates verified non-admin accounts and verification outbox events', async () => {
    await expect(repository.seedTestAccounts(makeRecords())).resolves.toEqual({
      createdCount: 11,
      existingCount: 0,
    });

    await expect(prisma.user.count()).resolves.toBe(11);
    await expect(
      prisma.user.count({
        where: {
          emailVerifiedAt: { not: null },
          isAdmin: false,
          status: 'ACTIVE',
        },
      }),
    ).resolves.toBe(11);
    await expect(
      prisma.outboxEvent.count({ where: { eventType: 'user.verified.v1' } }),
    ).resolves.toBe(11);
  });

  it('is repeatable without resetting a test account password', async () => {
    const records = makeRecords();
    await repository.seedTestAccounts(records);
    await prisma.user.update({
      data: { passwordHash: 'changed-password-hash' },
      where: { email: records[0]!.email },
    });

    await expect(repository.seedTestAccounts(makeRecords())).resolves.toEqual({
      createdCount: 0,
      existingCount: 11,
    });
    await expect(
      prisma.user.findUnique({ where: { email: records[0]!.email } }),
    ).resolves.toMatchObject({ passwordHash: 'changed-password-hash' });
    await expect(prisma.outboxEvent.count()).resolves.toBe(11);
  });

  it('rolls back the whole seed when an identity conflicts', async () => {
    await prisma.user.create({
      data: {
        email: 'existing@u.nus.edu',
        emailVerifiedAt: NOW,
        passwordHash: 'existing-password-hash',
        phoneNumber: '88000001',
        status: 'ACTIVE',
        username: 'ExistingUser',
      },
    });

    await expect(
      repository.seedTestAccounts(makeRecords()),
    ).rejects.toMatchObject({ code: 'TEST_ACCOUNT_SEED_INVALID' });
    await expect(
      prisma.user.count({ where: { email: { startsWith: 'foc-loadtest-' } } }),
    ).resolves.toBe(0);
    await expect(prisma.outboxEvent.count()).resolves.toBe(0);
  });
});
