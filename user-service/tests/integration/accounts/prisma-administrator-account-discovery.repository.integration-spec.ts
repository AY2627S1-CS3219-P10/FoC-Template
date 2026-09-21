import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import { AccountStatus } from '../../../src/modules/accounts/domain/account-status.js';
import { PrismaAdministratorAccountDiscoveryRepository } from '../../../src/modules/accounts/infrastructure/persistence/prisma-administrator-account-discovery.repository.js';
import { PrismaClient } from '../../../src/generated/prisma/client.js';

const MIGRATION_PATH = resolve(
  'prisma/migrations/20260919000100_create_user_identity_tables/migration.sql',
);

describe('PrismaAdministratorAccountDiscoveryRepository', () => {
  let container: Awaited<ReturnType<PostgreSqlContainer['start']>>;
  let prisma: PrismaClient;
  let repository: PrismaAdministratorAccountDiscoveryRepository;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18-alpine').start();
    const connectionString = container.getConnectionUri();
    const migrationPool = new Pool({ connectionString });

    try {
      await migrationPool.query(await readFile(MIGRATION_PATH, 'utf8'));
    } finally {
      await migrationPool.end();
    }

    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    await prisma.$connect();
    repository = new PrismaAdministratorAccountDiscoveryRepository(prisma);
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
          email: 'admin@u.nus.edu',
          isAdmin: true,
          passwordHash: 'admin-password-hash',
          phoneNumber: '81111111',
          status: 'ACTIVE',
          username: 'CampusAdmin',
        },
        {
          email: 'arthur.student@u.nus.edu',
          passwordHash: 'student-password-hash',
          phoneNumber: '82222222',
          status: 'PENDING_VERIFICATION',
          username: 'ArthurStudent',
        },
        {
          email: 'other@u.nus.edu',
          passwordHash: 'other-password-hash',
          phoneNumber: '83333333',
          status: 'SUSPENDED',
          username: 'OtherStudent',
        },
      ],
    });
  });

  it('searches username and email case-insensitively with safe projections', async () => {
    const usernameResults = await repository.findAccounts({
      limit: 50,
      search: 'ARTHUR',
    });
    expect(usernameResults).toHaveLength(1);
    expect(usernameResults[0]).toMatchObject({
      email: 'arthur.student@u.nus.edu',
      isAdmin: false,
      status: AccountStatus.PendingVerification,
      username: 'ArthurStudent',
    });
    expect(typeof usernameResults[0]?.id).toBe('string');

    const emailResults = await repository.findAccounts({
      limit: 50,
      search: 'ADMIN@U.NUS.EDU',
    });
    expect(emailResults).toHaveLength(1);
    expect(emailResults[0]).toMatchObject({
      email: 'admin@u.nus.edu',
      isAdmin: true,
      status: AccountStatus.Active,
      username: 'CampusAdmin',
    });
    expect(typeof emailResults[0]?.id).toBe('string');
    expect(Object.keys(emailResults[0] ?? {}).sort()).toEqual([
      'email',
      'id',
      'isAdmin',
      'status',
      'username',
    ]);
  });

  it('orders by username and respects the requested limit', async () => {
    const results = await repository.findAccounts({ limit: 2 });

    expect(results.map(({ username }) => username)).toEqual([
      'ArthurStudent',
      'CampusAdmin',
    ]);
  });
});
