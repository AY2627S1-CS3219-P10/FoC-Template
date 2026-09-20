import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import type { AdministratorSeedRecord } from '../../../src/modules/accounts/application/ports/administrator-seed-repository.port.js';
import { AccountStatus } from '../../../src/modules/accounts/domain/account-status.js';
import { PrismaAdministratorSeedRepository } from '../../../src/modules/accounts/infrastructure/persistence/prisma-administrator-seed.repository.js';
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
const NOW = new Date('2026-09-20T06:00:00.000Z');

function makeRecords(): AdministratorSeedRecord[] {
  return Array.from({ length: 5 }, (_, index) => ({
    email: `operator${index + 1}@u.nus.edu`,
    emailVerifiedAt: NOW,
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    isAdmin: true,
    passwordHash: `password-hash-${index + 1}`,
    phoneNumber: `9000000${index + 1}`,
    status: AccountStatus.Active,
    username: `Admin${index + 1}`,
  }));
}

describe('PrismaAdministratorSeedRepository', () => {
  let container: Awaited<ReturnType<PostgreSqlContainer['start']>>;
  let prisma: PrismaClient;
  let repository: PrismaAdministratorSeedRepository;

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
    repository = new PrismaAdministratorSeedRepository(prisma);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE TABLE "users" CASCADE`;
  });

  it('creates exactly five active and verified administrator accounts', async () => {
    await expect(repository.seedAdministrators(makeRecords())).resolves.toEqual(
      { createdCount: 5, existingCount: 0 },
    );

    const administrators = await prisma.user.findMany({
      orderBy: { username: 'asc' },
      where: { isAdmin: true },
    });
    expect(administrators).toHaveLength(5);
    expect(administrators[0]).toMatchObject({
      emailVerifiedAt: NOW,
      isAdmin: true,
      passwordHash: 'password-hash-1',
      status: 'ACTIVE',
    });
  });

  it('is repeatable without resetting an administrator password', async () => {
    const records = makeRecords();
    await repository.seedAdministrators(records);
    await prisma.user.update({
      data: { passwordHash: 'administrator-changed-password' },
      where: { email: records[0]!.email },
    });

    await expect(repository.seedAdministrators(makeRecords())).resolves.toEqual(
      { createdCount: 0, existingCount: 5 },
    );
    await expect(
      prisma.user.findUnique({ where: { email: records[0]!.email } }),
    ).resolves.toMatchObject({
      passwordHash: 'administrator-changed-password',
    });
  });

  it('rolls back the whole seed when an identity conflicts', async () => {
    await prisma.user.create({
      data: {
        email: 'student@u.nus.edu',
        passwordHash: 'student-password-hash',
        phoneNumber: '90000001',
        status: 'ACTIVE',
        username: 'Student1',
      },
    });

    await expect(
      repository.seedAdministrators(makeRecords()),
    ).rejects.toMatchObject({ code: 'ADMINISTRATOR_SEED_INVALID' });
    await expect(prisma.user.count({ where: { isAdmin: true } })).resolves.toBe(
      0,
    );
  });
});
