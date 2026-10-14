import type { UserReportResponse } from '../../../src/modules/accounts/presentation/http/dto/moderation.dto.js';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { PrismaClient } from '../../../src/generated/prisma/client.js';
import { MIGRATION_PATHS } from './migration-paths.js';
import { PrismaModerationRepository } from '../../../src/modules/accounts/infrastructure/persistence/prisma-moderation.repository.js';
import { PrismaAuthenticationRepository } from '../../../src/modules/accounts/infrastructure/persistence/prisma-authentication.repository.js';
import { PrismaProfileRepository } from '../../../src/modules/accounts/infrastructure/persistence/prisma-profile.repository.js';
import { PrismaAdministratorPrivilegeRepository } from '../../../src/modules/accounts/infrastructure/persistence/prisma-administrator-privilege.repository.js';
import { JoseAccessToken } from '../../../src/modules/accounts/infrastructure/security/jose-access-token.js';
import { SecureRefreshToken } from '../../../src/modules/accounts/infrastructure/security/secure-refresh-token.js';
import { Argon2PasswordHasher } from '../../../src/modules/accounts/infrastructure/security/argon2-password-hasher.js';
import { SessionTokenIssuer } from '../../../src/modules/accounts/application/services/session-token-issuer.js';
import { AuthenticateAccessTokenUseCase } from '../../../src/modules/accounts/application/use-cases/authenticate-access-token.use-case.js';
import {
  LoginUseCase,
  type AuthenticationResult,
} from '../../../src/modules/accounts/application/use-cases/login.use-case.js';
import { RefreshSessionUseCase } from '../../../src/modules/accounts/application/use-cases/refresh-session.use-case.js';
import { LogoutUseCase } from '../../../src/modules/accounts/application/use-cases/logout.use-case.js';
import { GetProfileUseCase } from '../../../src/modules/accounts/application/use-cases/get-profile.use-case.js';
import { UpdatePhoneNumberUseCase } from '../../../src/modules/accounts/application/use-cases/update-phone-number.use-case.js';
import { UpdateUsernameUseCase } from '../../../src/modules/accounts/application/use-cases/update-username.use-case.js';
import { ChangePasswordUseCase } from '../../../src/modules/accounts/application/use-cases/change-password.use-case.js';
import {
  ReportUserUseCase,
  ResolveReportUseCase,
  SuspendAccountUseCase,
  ViewReportsUseCase,
} from '../../../src/modules/accounts/application/use-cases/moderation.use-cases.js';
import {
  UserReportsController,
  AdministratorReportsController,
  AdministratorSuspensionsController,
} from '../../../src/modules/accounts/presentation/http/moderation.controller.js';
import { AuthenticationController } from '../../../src/modules/accounts/presentation/http/authentication.controller.js';
import { PUBLIC_ENDPOINT_RATE_LIMITER } from '../../../src/modules/accounts/application/ports/public-endpoint-rate-limiter.port.js';
import { ProfileController } from '../../../src/modules/accounts/presentation/http/profile.controller.js';
import { BearerAuthenticationGuard } from '../../../src/modules/accounts/presentation/http/security/bearer-authentication.guard.js';
import { AdministratorAuthorizationGuard } from '../../../src/modules/accounts/presentation/http/security/administrator-authorization.guard.js';
import { configureHttpApplication } from '../../../src/platform/http/configure-http-application.js';

const ADMIN_ONE = '4a84f480-b1cb-4b81-b632-8bb49034b9e7';
const ADMIN_TWO = '77af9009-08e1-42f5-91d3-516920f0c571';
const STUDENT = '9fa02524-f606-4e1d-8cef-bfa0cf884e3e';
const TARGET = 'a23394c1-c131-4b77-bf0d-c39bc11bf81e';
const PASSWORD = 'Integration!Password';
function headers(auth: AuthenticationResult): { authorization: string } {
  return { authorization: `Bearer ${auth.accessToken}` };
}

describe('reporting and temporary suspension HTTP/database integration', () => {
  let container: Awaited<ReturnType<PostgreSqlContainer['start']>>;
  let prisma: PrismaClient;
  let app: NestFastifyApplication;
  let now: Date;
  let passwordHash: string;
  let moderation: PrismaModerationRepository;
  let authentication: PrismaAuthenticationRepository;
  const clock = { now: () => now };

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18-alpine').start();
    const connectionString = container.getConnectionUri();
    const pool = new Pool({ connectionString });
    try {
      for (const path of MIGRATION_PATHS)
        await pool.query(await readFile(path, 'utf8'));
    } finally {
      await pool.end();
    }
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    await prisma.$connect();
    moderation = new PrismaModerationRepository(prisma);
    authentication = new PrismaAuthenticationRepository(prisma);
    const profile = new PrismaProfileRepository(prisma, clock);
    const accessTokens = new JoseAccessToken(
      'moderation-integration-secret-at-least-32-characters',
    );
    const passwords = new Argon2PasswordHasher();
    passwordHash = await passwords.hash(PASSWORD);
    const refreshTokens = new SecureRefreshToken();
    const issuer = new SessionTokenIssuer({
      accessTokens,
      clock,
      idGenerator: { generate: randomUUID },
      refreshTokens,
    });
    const moduleRef = await Test.createTestingModule({
      controllers: [
        UserReportsController,
        AdministratorReportsController,
        AdministratorSuspensionsController,
        AuthenticationController,
        ProfileController,
      ],
      providers: [
        BearerAuthenticationGuard,
        AdministratorAuthorizationGuard,
        {
          provide: PUBLIC_ENDPOINT_RATE_LIMITER,
          useValue: {
            consume: () =>
              Promise.resolve({ allowed: true, retryAfterSeconds: 0 }),
          },
        },
        {
          provide: ReportUserUseCase,
          useValue: new ReportUserUseCase(moderation),
        },
        {
          provide: ViewReportsUseCase,
          useValue: new ViewReportsUseCase(moderation),
        },
        {
          provide: ResolveReportUseCase,
          useValue: new ResolveReportUseCase(moderation, clock),
        },
        {
          provide: SuspendAccountUseCase,
          useValue: new SuspendAccountUseCase(moderation, clock),
        },
        {
          provide: AuthenticateAccessTokenUseCase,
          useValue: new AuthenticateAccessTokenUseCase({
            accessTokens,
            clock,
            repository: authentication,
          }),
        },
        {
          provide: LoginUseCase,
          useValue: new LoginUseCase({
            passwordVerifier: passwords,
            repository: authentication,
            sessionTokenIssuer: issuer,
          }),
        },
        {
          provide: RefreshSessionUseCase,
          useValue: new RefreshSessionUseCase({
            clock,
            refreshTokens,
            repository: authentication,
            sessionTokenIssuer: issuer,
          }),
        },
        {
          provide: LogoutUseCase,
          useValue: new LogoutUseCase({
            clock,
            refreshTokens,
            repository: authentication,
          }),
        },
        {
          provide: GetProfileUseCase,
          useValue: new GetProfileUseCase(profile),
        },
        {
          provide: UpdatePhoneNumberUseCase,
          useValue: new UpdatePhoneNumberUseCase(profile),
        },
        {
          provide: UpdateUsernameUseCase,
          useValue: new UpdateUsernameUseCase(profile),
        },
        {
          provide: ChangePasswordUseCase,
          useValue: new ChangePasswordUseCase({
            clock,
            passwordHasher: passwords,
            passwordVerifier: passwords,
            repository: profile,
          }),
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    configureHttpApplication(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await container?.stop();
  });
  beforeEach(async () => {
    now = new Date();
    await prisma.$executeRaw`TRUNCATE TABLE "users" CASCADE`;
    await prisma.user.createMany({
      data: [ADMIN_ONE, ADMIN_TWO, STUDENT, TARGET].map((id, index) => ({
        id,
        email: `moderation${index}@u.nus.edu`,
        username: `Moderation${index}`,
        phoneNumber: `8111111${index}`,
        passwordHash,
        status: 'ACTIVE',
        emailVerifiedAt: now,
        isAdmin: index < 2,
      })),
    });
  });
  async function login(index: number): Promise<AuthenticationResult> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: `moderation${index}@u.nus.edu`, password: PASSWORD },
    });
    expect(response.statusCode).toBe(200);
    return response.json<AuthenticationResult>();
  }
  async function report(
    auth: AuthenticationResult,
    reportedUserId = TARGET,
  ): ReturnType<NestFastifyApplication['inject']> {
    return app.inject({
      method: 'POST',
      url: '/api/reports',
      headers: headers(auth),
      payload: { reportedUserId, description: ' Missed an agreed pickup. ' },
    });
  }
  async function suspend(
    auth: AuthenticationResult,
    target = TARGET,
    until = new Date(now.getTime() + 3600000),
  ): ReturnType<NestFastifyApplication['inject']> {
    return app.inject({
      method: 'PATCH',
      url: `/api/admin/accounts/${target}/suspension`,
      headers: headers(auth),
      payload: { suspendedUntil: until.toISOString() },
    });
  }

  it('creates an OPEN report with session-derived reporter, safe identities and timestamps, without suspending', async () => {
    const response = await report(await login(2));
    expect(response.statusCode).toBe(201);
    const body = response.json<UserReportResponse>();
    expect(body).toMatchObject({
      reporterUserId: STUDENT,
      reportedUserId: TARGET,
      description: 'Missed an agreed pickup.',
      status: 'OPEN',
      resolvedAt: null,
    });
    expect(body.reporter).toEqual({ id: STUDENT, username: 'Moderation2' });
    expect(body.reportedUser).toEqual({ id: TARGET, username: 'Moderation3' });
    expect(Number.isFinite(Date.parse(body.createdAt))).toBe(true);
    expect(await prisma.userReport.count()).toBe(1);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: TARGET } }))
        .suspendedUntil,
    ).toBeNull();
    expect(JSON.stringify(body)).not.toMatch(
      /passwordHash|refreshToken|session|phoneNumber/,
    );
  });
  it('rejects self-report, missing targets, unauthenticated requests and spoofed reporter IDs', async () => {
    const student = await login(2);
    expect((await report(student, STUDENT)).statusCode).toBe(403);
    expect((await report(student, randomUUID())).statusCode).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/reports',
          payload: { reportedUserId: TARGET, description: 'Issue' },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/reports',
          headers: headers(student),
          payload: {
            reportedUserId: TARGET,
            reporterUserId: ADMIN_ONE,
            description: 'Issue',
          },
        })
      ).statusCode,
    ).toBe(400);
    expect(await prisma.userReport.count()).toBe(0);
  });
  it.each(['', '   ', 'x'.repeat(501)])(
    'rejects invalid report descriptions through the real validation pipe',
    async (description) => {
      const student = await login(2);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/reports',
            headers: headers(student),
            payload: { reportedUserId: TARGET, description },
          })
        ).statusCode,
      ).toBe(400);
    },
  );
  it('allows admins to list/view reports but blocks students from viewing, resolving and suspending', async () => {
    const student = await login(2);
    const admin = await login(0);
    const created = (await report(student)).json<UserReportResponse>();
    for (const url of [
      '/api/admin/reports',
      `/api/admin/reports/${created.id}`,
    ])
      expect(
        (await app.inject({ method: 'GET', url, headers: headers(student) }))
          .statusCode,
      ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/admin/reports/${created.id}/resolve`,
          headers: headers(student),
        })
      ).statusCode,
    ).toBe(403);
    expect((await suspend(student)).statusCode).toBe(403);
    const listed = await app.inject({
      method: 'GET',
      url: '/api/admin/reports?status=OPEN&limit=1&offset=0',
      headers: headers(admin),
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toHaveLength(1);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/admin/reports/${created.id}`,
          headers: headers(admin),
        })
      ).json(),
    ).toEqual(created);
    for (const query of ['limit=101', 'limit=0', 'offset=-1', 'status=INVALID'])
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `/api/admin/reports?${query}`,
            headers: headers(admin),
          })
        ).statusCode,
      ).toBe(400);
  });
  it('resolves idempotently with an authenticated resolver and leaves the target unsuspended', async () => {
    const created = (await report(await login(2))).json<UserReportResponse>();
    const admin = await login(0);
    const resolved = await app.inject({
      method: 'PATCH',
      url: `/api/admin/reports/${created.id}/resolve`,
      headers: headers(admin),
    });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json()).toMatchObject({
      status: 'RESOLVED',
      resolvedBy: { id: ADMIN_ONE },
    });
    now = new Date(now.getTime() + 1000);
    const replay = await app.inject({
      method: 'PATCH',
      url: `/api/admin/reports/${created.id}/resolve`,
      headers: headers(admin),
    });
    expect(replay.json<UserReportResponse>().resolvedAt).toBe(
      resolved.json<UserReportResponse>().resolvedAt,
    );
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: TARGET } }))
        .suspendedUntil,
    ).toBeNull();
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/admin/reports/${randomUUID()}/resolve`,
          headers: headers(admin),
        })
      ).statusCode,
    ).toBe(404);
  });
  it('suspends until the requested time, revokes every session, and blocks login/refresh/protected routes', async () => {
    const target = await login(3);
    await login(3);
    const admin = await login(0);
    const until = new Date(now.getTime() + 3600000);
    const response = await suspend(admin, TARGET, until);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: TARGET,
      status: 'SUSPENDED',
      suspendedUntil: until.toISOString(),
    });
    expect(
      await prisma.session.count({
        where: { userId: TARGET, revokedAt: null },
      }),
    ).toBe(0);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: TARGET } }))
        .suspendedUntil,
    ).toEqual(until);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { email: 'moderation3@u.nus.edu', password: PASSWORD },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/refresh',
          payload: { refreshToken: target.refreshToken },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/accounts/me',
          headers: headers(target),
        })
      ).statusCode,
    ).toBe(401);
    expect((await report(target, STUDENT)).statusCode).toBe(401);
  });
  it('blocks even a non-revoked session while a timeout is active', async () => {
    const target = await login(3);
    await prisma.user.update({
      where: { id: TARGET },
      data: { suspendedUntil: new Date(now.getTime() + 3600000) },
    });
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/accounts/me',
          headers: headers(target),
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/refresh',
          payload: { refreshToken: target.refreshToken },
        })
      ).statusCode,
    ).toBe(401);
  });
  it('allows a fresh login and protected routes exactly at expiry without DB reactivation or resurrecting old sessions', async () => {
    const old = await login(3);
    const admin = await login(0);
    const until = new Date(now.getTime() + 3600000);
    expect((await suspend(admin, TARGET, until)).statusCode).toBe(200);
    now = until;
    const fresh = await login(3);
    const profile = await app.inject({
      method: 'GET',
      url: '/api/accounts/me',
      headers: headers(fresh),
    });
    expect(profile.statusCode).toBe(200);
    expect(profile.json<{ status: string }>().status).toBe('ACTIVE');
    expect((await report(fresh, STUDENT)).statusCode).toBe(201);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: TARGET } }))
        .suspendedUntil,
    ).toEqual(until);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/refresh',
          payload: { refreshToken: old.refreshToken },
        })
      ).statusCode,
    ).toBe(401);
  });
  it('rejects self-suspension, missing targets, malformed/past expiry, and permanent statuses', async () => {
    const admin = await login(0);
    expect((await suspend(admin, ADMIN_ONE)).statusCode).toBe(403);
    expect((await suspend(admin, randomUUID())).statusCode).toBe(404);
    expect((await suspend(admin, TARGET, now)).statusCode).toBe(400);
    for (const value of ['not-a-date', '2027-01-01T12:00:00'])
      expect(
        (
          await app.inject({
            method: 'PATCH',
            url: `/api/admin/accounts/${TARGET}/suspension`,
            headers: headers(admin),
            payload: { suspendedUntil: value },
          })
        ).statusCode,
      ).toBe(400);
    for (const status of [
      'BANNED',
      'PENDING_VERIFICATION',
      'SUSPENDED',
    ] as const) {
      await prisma.user.update({
        where: { id: TARGET },
        data: { status, suspendedUntil: new Date(now.getTime() - 1) },
      });
      expect((await suspend(admin)).statusCode).toBe(409);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/auth/login',
            payload: { email: 'moderation3@u.nus.edu', password: PASSWORD },
          })
        ).statusCode,
      ).toBe(403);
    }
  });
  it('protects the last usable admin even when another admin is timed out', async () => {
    const admin = await login(0);
    expect((await suspend(admin, ADMIN_TWO)).statusCode).toBe(200);
    await expect(
      prisma.user.update({
        where: { id: ADMIN_ONE },
        data: { suspendedUntil: new Date(now.getTime() + 3600000) },
      }),
    ).rejects.toBeDefined();
    await expect(
      prisma.user.update({
        where: { id: ADMIN_ONE },
        data: { isAdmin: false },
      }),
    ).rejects.toBeDefined();
    await expect(
      prisma.user.delete({ where: { id: ADMIN_ONE } }),
    ).rejects.toBeDefined();
    await expect(
      new PrismaAdministratorPrivilegeRepository(
        prisma,
      ).changeAdministratorPrivilege({
        actorUserId: ADMIN_ONE,
        targetUserId: ADMIN_ONE,
        isAdmin: false,
        changedAt: now,
      }),
    ).rejects.toMatchObject({ code: 'LAST_ADMINISTRATOR_REQUIRED' });
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: ADMIN_ONE } }))
        .suspendedUntil,
    ).toBeNull();
  });
  it('serializes opposing admin suspensions so one usable administrator remains', async () => {
    const one = await login(0);
    const two = await login(1);
    const results = await Promise.all([
      suspend(one, ADMIN_TWO),
      suspend(two, ADMIN_ONE),
    ]);
    expect(results.filter((result) => result.statusCode === 200)).toHaveLength(
      1,
    );
    expect(
      await prisma.user.count({
        where: {
          isAdmin: true,
          status: 'ACTIVE',
          OR: [{ suspendedUntil: null }, { suspendedUntil: { lte: now } }],
        },
      }),
    ).toBe(1);
  });
  it('serializes login session creation with suspension so no active session escapes revocation', async () => {
    const results = await Promise.allSettled([
      authentication.createSession({
        userId: TARGET,
        id: randomUUID(),
        refreshTokenHash: randomUUID(),
        createdAt: now,
        expiresAt: new Date(now.getTime() + 86400000),
      }),
      moderation.suspendAccount({
        actorUserId: ADMIN_ONE,
        targetUserId: TARGET,
        changedAt: now,
        suspendedUntil: new Date(now.getTime() + 3600000),
      }),
    ]);
    expect(results[1].status).toBe('fulfilled');
    expect(
      await prisma.session.count({
        where: { userId: TARGET, revokedAt: null },
      }),
    ).toBe(0);
  });
  it('serializes refresh rotation with suspension so no active replacement session survives', async () => {
    const target = await login(3);
    const admin = await login(0);
    const [refresh, suspended] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: target.refreshToken },
      }),
      suspend(admin),
    ]);
    expect(suspended.statusCode).toBe(200);
    expect([200, 401]).toContain(refresh.statusCode);
    expect(
      await prisma.session.count({
        where: { userId: TARGET, revokedAt: null },
      }),
    ).toBe(0);
    if (refresh.statusCode === 200)
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/api/accounts/me',
            headers: headers(refresh.json<AuthenticationResult>()),
          })
        ).statusCode,
      ).toBe(401);
  });
  it('coordinates suspension with demotion using the existing admin lock', async () => {
    const results = await Promise.allSettled([
      moderation.suspendAccount({
        actorUserId: ADMIN_ONE,
        targetUserId: ADMIN_TWO,
        changedAt: now,
        suspendedUntil: new Date(now.getTime() + 3600000),
      }),
      new PrismaAdministratorPrivilegeRepository(
        prisma,
      ).changeAdministratorPrivilege({
        actorUserId: ADMIN_TWO,
        targetUserId: ADMIN_ONE,
        isAdmin: false,
        changedAt: now,
      }),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      await prisma.user.count({
        where: {
          isAdmin: true,
          status: 'ACTIVE',
          OR: [{ suspendedUntil: null }, { suspendedUntil: { lte: now } }],
        },
      }),
    ).toBe(1);
  });
});
