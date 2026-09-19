import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import type { AccountAlreadyExistsError } from '../../../src/modules/accounts/application/errors/account-already-exists.error.js';
import type { NewAccountRecord } from '../../../src/modules/accounts/application/ports/account-repository.port.js';
import { AccountStatus } from '../../../src/modules/accounts/domain/account-status.js';
import { NusEmail } from '../../../src/modules/accounts/domain/nus-email.js';
import { PhoneNumber } from '../../../src/modules/accounts/domain/phone-number.js';
import { Username } from '../../../src/modules/accounts/domain/username.js';
import { PrismaAccountRepository } from '../../../src/modules/accounts/infrastructure/persistence/prisma-account.repository.js';
import { PrismaClient } from '../../../src/generated/prisma/client.js';

const MIGRATION_PATH = resolve(
  'prisma/migrations/20260919000100_create_user_identity_tables/migration.sql',
);

const ACCOUNT: NewAccountRecord = {
  email: 'student@u.nus.edu',
  id: '4a84f480-b1cb-4b81-b632-8bb49034b9e7',
  isAdmin: false,
  passwordHash: '$argon2id$test-hash',
  phoneNumber: '91234567',
  status: AccountStatus.PendingVerification,
  username: 'Arthur3219',
};

describe('PrismaAccountRepository', () => {
  let container: Awaited<ReturnType<PostgreSqlContainer['start']>>;
  let prisma: PrismaClient;
  let repository: PrismaAccountRepository;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18-alpine').start();
    const connectionString = container.getConnectionUri();
    const migrationSql = await readFile(MIGRATION_PATH, 'utf8');
    const migrationPool = new Pool({ connectionString });

    try {
      await migrationPool.query(migrationSql);
    } finally {
      await migrationPool.end();
    }

    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
    });
    await prisma.$connect();
    repository = new PrismaAccountRepository(prisma);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
  });

  it('persists an account and performs case-insensitive uniqueness checks', async () => {
    await repository.create(ACCOUNT);

    await expect(
      repository.isUsernameTaken(Username.create('ARTHUR3219')),
    ).resolves.toBe(true);
    await expect(
      repository.isEmailTaken(NusEmail.create('STUDENT@U.NUS.EDU')),
    ).resolves.toBe(true);
    await expect(
      repository.isPhoneNumberTaken(PhoneNumber.create('91234567')),
    ).resolves.toBe(true);
    await expect(
      prisma.user.findUnique({ where: { id: ACCOUNT.id } }),
    ).resolves.toMatchObject({
      email: 'student@u.nus.edu',
      isAdmin: false,
      passwordHash: '$argon2id$test-hash',
      status: 'PENDING_VERIFICATION',
      username: 'Arthur3219',
    });
  });

  it('maps a database uniqueness race to an application conflict', async () => {
    await repository.create(ACCOUNT);

    await expect(
      repository.create({
        ...ACCOUNT,
        id: '44190d22-9ee2-4655-b236-451afb0cb225',
        phoneNumber: '81234567',
        username: 'AnotherUser',
      }),
    ).rejects.toMatchObject({
      code: 'EMAIL_ALREADY_REGISTERED',
      field: 'email',
    } satisfies Partial<AccountAlreadyExistsError>);
  });
});
