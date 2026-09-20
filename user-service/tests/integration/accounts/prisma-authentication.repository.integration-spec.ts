import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import { PrismaAuthenticationRepository } from '../../../src/modules/accounts/infrastructure/persistence/prisma-authentication.repository.js';
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
const SESSION_ID = 'a23394c1-c131-4b77-bf0d-c39bc11bf81e';
const NOW = new Date('2026-09-20T02:00:00.000Z');

describe('PrismaAuthenticationRepository', () => {
  let container: Awaited<ReturnType<PostgreSqlContainer['start']>>;
  let prisma: PrismaClient;
  let repository: PrismaAuthenticationRepository;

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
    repository = new PrismaAuthenticationRepository(prisma);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
    await prisma.user.create({
      data: {
        email: 'student@u.nus.edu',
        id: USER_ID,
        isAdmin: false,
        passwordHash: 'stored-password-hash',
        phoneNumber: '91234567',
        status: 'ACTIVE',
        username: 'Arthur3219',
      },
    });
  });

  it('loads login credentials and creates a hashed refresh session', async () => {
    await expect(
      repository.findAccountByEmail('student@u.nus.edu'),
    ).resolves.toMatchObject({
      id: USER_ID,
      passwordHash: 'stored-password-hash',
      status: 'ACTIVE',
    });

    await repository.createSession({
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + 86_400_000),
      id: SESSION_ID,
      refreshTokenHash: 'current-refresh-token-hash',
      userId: USER_ID,
    });

    await expect(
      prisma.session.findUnique({ where: { id: SESSION_ID } }),
    ).resolves.toMatchObject({
      refreshTokenHash: 'current-refresh-token-hash',
      revokedAt: null,
      userId: USER_ID,
    });
    await expect(
      repository.findActiveSessionAccount({
        now: NOW,
        sessionId: SESSION_ID,
        userId: USER_ID,
      }),
    ).resolves.toMatchObject({ id: USER_ID, status: 'ACTIVE' });
    await expect(
      repository.findActiveSessionAccount({
        now: new Date(NOW.getTime() + 86_400_001),
        sessionId: SESSION_ID,
        userId: USER_ID,
      }),
    ).resolves.toBeNull();
  });

  it('allows only one concurrent rotation and detects reuse', async () => {
    await repository.createSession({
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + 86_400_000),
      id: SESSION_ID,
      refreshTokenHash: 'current-refresh-token-hash',
      userId: USER_ID,
    });

    const rotations = await Promise.all([
      repository.rotateSession({
        currentRefreshTokenHash: 'current-refresh-token-hash',
        now: new Date(NOW.getTime() + 1_000),
        replacement: {
          createdAt: new Date(NOW.getTime() + 1_000),
          expiresAt: new Date(NOW.getTime() + 86_401_000),
          id: '77af9009-08e1-42f5-91d3-516920f0c571',
          refreshTokenHash: 'replacement-one-hash',
        },
      }),
      repository.rotateSession({
        currentRefreshTokenHash: 'current-refresh-token-hash',
        now: new Date(NOW.getTime() + 1_000),
        replacement: {
          createdAt: new Date(NOW.getTime() + 1_000),
          expiresAt: new Date(NOW.getTime() + 86_401_000),
          id: '9fa02524-f606-4e1d-8cef-bfa0cf884e3e',
          refreshTokenHash: 'replacement-two-hash',
        },
      }),
    ]);

    expect(rotations.filter((result) => result !== null)).toHaveLength(1);
    await expect(
      prisma.session.count({ where: { revokedAt: null, userId: USER_ID } }),
    ).resolves.toBe(1);

    await expect(
      repository.rotateSession({
        currentRefreshTokenHash: 'current-refresh-token-hash',
        now: new Date(NOW.getTime() + 2_000),
        replacement: {
          createdAt: new Date(NOW.getTime() + 2_000),
          expiresAt: new Date(NOW.getTime() + 86_402_000),
          id: '44190d22-9ee2-4655-b236-451afb0cb225',
          refreshTokenHash: 'replay-replacement-hash',
        },
      }),
    ).resolves.toBeNull();
    await expect(
      prisma.session.count({ where: { revokedAt: null, userId: USER_ID } }),
    ).resolves.toBe(0);
  });

  it('revokes a session idempotently without exposing token state', async () => {
    await repository.createSession({
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + 86_400_000),
      id: SESSION_ID,
      refreshTokenHash: 'current-refresh-token-hash',
      userId: USER_ID,
    });

    const input = {
      now: new Date(NOW.getTime() + 1_000),
      refreshTokenHash: 'current-refresh-token-hash',
    };
    await repository.revokeSession(input);
    await repository.revokeSession(input);

    await expect(
      prisma.session.findUnique({ where: { id: SESSION_ID } }),
    ).resolves.toMatchObject({ revokedAt: input.now });
  });
});
