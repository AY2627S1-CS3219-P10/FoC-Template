import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Controller, Get, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import {
  RedisContainer,
  type StartedRedisContainer,
} from '@testcontainers/redis';
import { PrismaPg } from '@prisma/adapter-pg';
import { Queue } from 'bullmq';
import { Pool } from 'pg';

import { AccountsModule } from '../../src/modules/accounts/accounts.module.js';
import type { AdministratorSeedInput } from '../../src/modules/accounts/application/use-cases/seed-administrator-accounts.use-case.js';
import { SeedAdministratorAccountsUseCase } from '../../src/modules/accounts/application/use-cases/seed-administrator-accounts.use-case.js';
import { PrismaAdministratorSeedRepository } from '../../src/modules/accounts/infrastructure/persistence/prisma-administrator-seed.repository.js';
import { Argon2PasswordHasher } from '../../src/modules/accounts/infrastructure/security/argon2-password-hasher.js';
import { UuidGenerator } from '../../src/modules/accounts/infrastructure/security/uuid-generator.js';
import { SystemClock } from '../../src/modules/accounts/infrastructure/system-clock.js';
import { AdministratorOnly } from '../../src/modules/accounts/presentation/http/security/administrator-only.decorator.js';
import {
  VERIFICATION_EMAIL_QUEUE_NAME,
  type VerificationEmailJobData,
} from '../../src/modules/accounts/infrastructure/messaging/verification-email.queue.js';
import { VerificationEmailWorker } from '../../src/modules/accounts/infrastructure/messaging/verification-email.worker.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { validateEnvironment } from '../../src/platform/config/environment.schema.js';
import { configureHttpApplication } from '../../src/platform/http/configure-http-application.js';

const MIGRATION_PATHS = [
  resolve(
    'prisma/migrations/20260919000100_create_user_identity_tables/migration.sql',
  ),
  resolve(
    'prisma/migrations/20260920000100_enforce_one_active_verification_code/migration.sql',
  ),
];
const STUDENT_EMAIL = 'lifecycle@u.nus.edu';
const OLD_PASSWORD = 'Initial!Pass1';
const NEW_PASSWORD = 'Updated!Pass2';
const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;
const ORIGINAL_REDIS_URL = process.env.REDIS_URL;

interface AuthenticationBody {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    isAdmin: boolean;
    username: string;
  };
}

@Controller('test/admin-only')
@AdministratorOnly()
class AdministratorOnlyTestController {
  @Get()
  getProtectedResource(): { access: 'granted' } {
    return { access: 'granted' };
  }
}

function makeAdministratorInputs(): AdministratorSeedInput[] {
  return Array.from({ length: 5 }, (_, index) => ({
    email: `seeded-admin-${index + 1}@u.nus.edu`,
    operator: `Dummy Operator ${index + 1}`,
    password: `Admin!Pass${index + 1}`,
    phoneNumber: `8100000${index + 1}`,
    username: `SeededAdmin${index + 1}`,
  }));
}

describe('account lifecycle API', () => {
  let app: NestFastifyApplication;
  let postgres: Awaited<ReturnType<PostgreSqlContainer['start']>>;
  let prisma: PrismaClient;
  let redis: StartedRedisContainer;
  let verificationQueue: Queue<VerificationEmailJobData>;

  beforeAll(async () => {
    [postgres, redis] = await Promise.all([
      new PostgreSqlContainer('postgres:18-alpine').start(),
      new RedisContainer('redis:8-alpine').start(),
    ]);
    const databaseUrl = postgres.getConnectionUri();
    const redisUrl = redis.getConnectionUrl();
    const migrationPool = new Pool({ connectionString: databaseUrl });

    try {
      for (const migrationPath of MIGRATION_PATHS) {
        await migrationPool.query(await readFile(migrationPath, 'utf8'));
      }
    } finally {
      await migrationPool.end();
    }

    process.env.DATABASE_URL = databaseUrl;
    process.env.REDIS_URL = redisUrl;
    const moduleRef = await Test.createTestingModule({
      controllers: [AdministratorOnlyTestController],
      imports: [
        ConfigModule.forRoot({
          cache: true,
          isGlobal: true,
          validate: validateEnvironment,
        }),
        AccountsModule,
      ],
    })
      .overrideProvider(VerificationEmailWorker)
      .useValue({
        onModuleDestroy: (): void => undefined,
        onModuleInit: (): void => undefined,
      })
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    configureHttpApplication(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
    await prisma.$connect();
    verificationQueue = new Queue<VerificationEmailJobData>(
      VERIFICATION_EMAIL_QUEUE_NAME,
      { connection: { url: redisUrl } },
    );
  });

  afterAll(async () => {
    await verificationQueue?.close();
    await prisma?.$disconnect();
    await (app as INestApplication | undefined)?.close();
    await Promise.all([postgres?.stop(), redis?.stop()]);
    restoreEnvironmentVariable('DATABASE_URL', ORIGINAL_DATABASE_URL);
    restoreEnvironmentVariable('REDIS_URL', ORIGINAL_REDIS_URL);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
    await redis.executeCliCmd('FLUSHDB');
  });

  it('completes registration, verification, authentication, profile, credential, and logout flows', async () => {
    const registration = await app.inject({
      method: 'POST',
      payload: {
        email: STUDENT_EMAIL,
        password: OLD_PASSWORD,
        phoneNumber: '91234567',
        username: 'LifecycleStudent',
      },
      url: '/api/accounts/register',
    });
    expect(registration.statusCode).toBe(201);

    const verificationJobs = await verificationQueue.getJobs(['waiting']);
    expect(verificationJobs).toHaveLength(1);
    expect(verificationJobs[0]!.data.recipientEmail).toBe(STUDENT_EMAIL);

    const verification = await app.inject({
      method: 'POST',
      payload: {
        code: verificationJobs[0]!.data.code,
        email: STUDENT_EMAIL,
      },
      url: '/api/accounts/verify-email',
    });
    expect(verification.statusCode).toBe(204);

    const login = await app.inject({
      method: 'POST',
      payload: { email: STUDENT_EMAIL, password: OLD_PASSWORD },
      url: '/api/auth/login',
    });
    expect(login.statusCode).toBe(200);
    const initialSession = login.json<AuthenticationBody>();
    expect(initialSession.user).toMatchObject({
      isAdmin: false,
      username: 'LifecycleStudent',
    });

    const profile = await app.inject({
      headers: { authorization: `Bearer ${initialSession.accessToken}` },
      method: 'GET',
      url: '/api/accounts/me',
    });
    expect(profile.statusCode).toBe(200);
    expect(profile.json()).toMatchObject({
      email: STUDENT_EMAIL,
      phoneNumber: '91234567',
    });

    const phoneUpdate = await app.inject({
      headers: { authorization: `Bearer ${initialSession.accessToken}` },
      method: 'PATCH',
      payload: { phoneNumber: '87654321' },
      url: '/api/accounts/me/phone-number',
    });
    expect(phoneUpdate.statusCode).toBe(200);
    expect(phoneUpdate.json()).toMatchObject({ phoneNumber: '87654321' });

    const refresh = await app.inject({
      method: 'POST',
      payload: { refreshToken: initialSession.refreshToken },
      url: '/api/auth/refresh',
    });
    expect(refresh.statusCode).toBe(200);
    const refreshedSession = refresh.json<AuthenticationBody>();

    const passwordChange = await app.inject({
      headers: { authorization: `Bearer ${refreshedSession.accessToken}` },
      method: 'PATCH',
      payload: { currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD },
      url: '/api/accounts/me/password',
    });
    expect(passwordChange.statusCode).toBe(204);

    const revokedAccess = await app.inject({
      headers: { authorization: `Bearer ${refreshedSession.accessToken}` },
      method: 'GET',
      url: '/api/accounts/me',
    });
    expect(revokedAccess.statusCode).toBe(401);

    const revokedRefresh = await app.inject({
      method: 'POST',
      payload: { refreshToken: refreshedSession.refreshToken },
      url: '/api/auth/refresh',
    });
    expect(revokedRefresh.statusCode).toBe(401);

    const oldPasswordLogin = await app.inject({
      method: 'POST',
      payload: { email: STUDENT_EMAIL, password: OLD_PASSWORD },
      url: '/api/auth/login',
    });
    expect(oldPasswordLogin.statusCode).toBe(401);

    const newPasswordLogin = await app.inject({
      method: 'POST',
      payload: { email: STUDENT_EMAIL, password: NEW_PASSWORD },
      url: '/api/auth/login',
    });
    expect(newPasswordLogin.statusCode).toBe(200);
    const finalSession = newPasswordLogin.json<AuthenticationBody>();

    const logout = await app.inject({
      method: 'POST',
      payload: { refreshToken: finalSession.refreshToken },
      url: '/api/auth/logout',
    });
    expect(logout.statusCode).toBe(204);

    const loggedOutAccess = await app.inject({
      headers: { authorization: `Bearer ${finalSession.accessToken}` },
      method: 'GET',
      url: '/api/accounts/me',
    });
    expect(loggedOutAccess.statusCode).toBe(401);
  });

  it('allows a seeded administrator and rejects a normal student', async () => {
    const passwordHasher = new Argon2PasswordHasher();
    const seedAdministrators = new SeedAdministratorAccountsUseCase({
      clock: new SystemClock(),
      idGenerator: new UuidGenerator(),
      passwordHasher,
      repository: new PrismaAdministratorSeedRepository(prisma),
    });
    await seedAdministrators.execute(makeAdministratorInputs());
    await prisma.user.create({
      data: {
        email: 'normal-student@u.nus.edu',
        emailVerifiedAt: new Date(),
        passwordHash: await passwordHasher.hash('Student!Pass1'),
        phoneNumber: '89999999',
        status: 'ACTIVE',
        username: 'NormalStudent',
      },
    });

    const studentLogin = await app.inject({
      method: 'POST',
      payload: {
        email: 'normal-student@u.nus.edu',
        password: 'Student!Pass1',
      },
      url: '/api/auth/login',
    });
    expect(studentLogin.statusCode).toBe(200);
    const studentSession = studentLogin.json<AuthenticationBody>();

    const forbidden = await app.inject({
      headers: { authorization: `Bearer ${studentSession.accessToken}` },
      method: 'GET',
      url: '/api/test/admin-only',
    });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json()).toMatchObject({
      code: 'ADMINISTRATOR_PRIVILEGES_REQUIRED',
    });

    const administratorLogin = await app.inject({
      method: 'POST',
      payload: {
        email: 'seeded-admin-1@u.nus.edu',
        password: 'Admin!Pass1',
      },
      url: '/api/auth/login',
    });
    expect(administratorLogin.statusCode).toBe(200);
    const administratorSession = administratorLogin.json<AuthenticationBody>();
    expect(administratorSession.user.isAdmin).toBe(true);

    const allowed = await app.inject({
      headers: {
        authorization: `Bearer ${administratorSession.accessToken}`,
      },
      method: 'GET',
      url: '/api/test/admin-only',
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json()).toEqual({ access: 'granted' });
  });
});

function restoreEnvironmentVariable(
  name: 'DATABASE_URL' | 'REDIS_URL',
  value: string | undefined,
): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
