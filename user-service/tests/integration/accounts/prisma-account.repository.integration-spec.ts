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
import { PrismaEmailVerificationRepository } from '../../../src/modules/accounts/infrastructure/persistence/prisma-email-verification.repository.js';
import { PrismaClient } from '../../../src/generated/prisma/client.js';

const MIGRATION_PATHS = [
  resolve(
    'prisma/migrations/20260919000100_create_user_identity_tables/migration.sql',
  ),
  resolve(
    'prisma/migrations/20260920000100_enforce_one_active_verification_code/migration.sql',
  ),
];
const NOW = new Date('2026-09-20T02:00:00.000Z');

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
  let verificationRepository: PrismaEmailVerificationRepository;

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
    repository = new PrismaAccountRepository(prisma);
    verificationRepository = new PrismaEmailVerificationRepository(prisma);
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
    await expect(
      verificationRepository.findPendingAccountByEmail(ACCOUNT.email),
    ).resolves.toEqual({ email: ACCOUNT.email, id: ACCOUNT.id });
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

  it('invalidates the previous unused verification code when issuing another', async () => {
    await repository.create(ACCOUNT);
    await verificationRepository.issueCode({
      codeHash: 'first-code-hash',
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + 600_000),
      id: '9fa02524-f606-4e1d-8cef-bfa0cf884e3e',
      userId: ACCOUNT.id,
    });
    const replacementTime = new Date(NOW.getTime() + 1_000);

    await expect(
      verificationRepository.issueCode({
        codeHash: 'second-code-hash',
        createdAt: replacementTime,
        expiresAt: new Date(replacementTime.getTime() + 600_000),
        id: '77af9009-08e1-42f5-91d3-516920f0c571',
        userId: ACCOUNT.id,
      }),
    ).resolves.toBe(true);
    await expect(
      prisma.emailVerificationCode.findMany({
        orderBy: { createdAt: 'asc' },
        where: { userId: ACCOUNT.id },
      }),
    ).resolves.toMatchObject([
      { codeHash: 'first-code-hash', usedAt: replacementTime },
      { codeHash: 'second-code-hash', usedAt: null },
    ]);
  });

  it('atomically consumes a valid code and activates the account', async () => {
    await repository.create(ACCOUNT);
    await verificationRepository.issueCode({
      codeHash: 'valid-code-hash',
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + 600_000),
      id: '9fa02524-f606-4e1d-8cef-bfa0cf884e3e',
      userId: ACCOUNT.id,
    });
    const verificationTime = new Date(NOW.getTime() + 1_000);

    await expect(
      verificationRepository.verifyAndActivate({
        candidateCodeHash: 'valid-code-hash',
        email: ACCOUNT.email,
        maximumAttempts: 5,
        now: verificationTime,
      }),
    ).resolves.toBe(true);
    await expect(
      prisma.user.findUnique({ where: { id: ACCOUNT.id } }),
    ).resolves.toMatchObject({
      emailVerifiedAt: verificationTime,
      status: 'ACTIVE',
    });
    await expect(
      verificationRepository.findPendingAccountByEmail(ACCOUNT.email),
    ).resolves.toBeNull();
    await expect(
      verificationRepository.verifyAndActivate({
        candidateCodeHash: 'valid-code-hash',
        email: ACCOUNT.email,
        maximumAttempts: 5,
        now: verificationTime,
      }),
    ).resolves.toBe(false);
  });

  it('blocks verification after five incorrect attempts', async () => {
    await repository.create(ACCOUNT);
    await verificationRepository.issueCode({
      codeHash: 'valid-code-hash',
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + 600_000),
      id: '9fa02524-f606-4e1d-8cef-bfa0cf884e3e',
      userId: ACCOUNT.id,
    });
    const input = {
      email: ACCOUNT.email,
      maximumAttempts: 5,
      now: new Date(NOW.getTime() + 1_000),
    };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        verificationRepository.verifyAndActivate({
          ...input,
          candidateCodeHash: 'incorrect-code-hash',
        }),
      ).resolves.toBe(false);
    }

    await expect(
      verificationRepository.verifyAndActivate({
        ...input,
        candidateCodeHash: 'valid-code-hash',
      }),
    ).resolves.toBe(false);
    await expect(
      prisma.emailVerificationCode.findUnique({
        where: { id: '9fa02524-f606-4e1d-8cef-bfa0cf884e3e' },
      }),
    ).resolves.toMatchObject({ attemptCount: 5 });
    await expect(
      prisma.user.findUnique({ where: { id: ACCOUNT.id } }),
    ).resolves.toMatchObject({ status: 'PENDING_VERIFICATION' });
  });
});
