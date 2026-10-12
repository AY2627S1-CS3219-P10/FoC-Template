import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ModerationError } from '../../../../../src/modules/accounts/application/errors/moderation.error.js';
import type {
  ModerationRepositoryPort,
  UserReport,
  SuspendAccountRecord,
  SuspendedAccount,
} from '../../../../../src/modules/accounts/application/ports/moderation-repository.port.js';
import type { AuthenticatedAccount } from '../../../../../src/modules/accounts/application/ports/authentication-repository.port.js';
import { AuthenticateAccessTokenUseCase } from '../../../../../src/modules/accounts/application/use-cases/authenticate-access-token.use-case.js';
import {
  ReportUserUseCase,
  ResolveReportUseCase,
  SuspendAccountUseCase,
  ViewReportsUseCase,
} from '../../../../../src/modules/accounts/application/use-cases/moderation.use-cases.js';
import { AccountStatus } from '../../../../../src/modules/accounts/domain/account-status.js';
import {
  UserReportsController,
  AdministratorReportsController,
  AdministratorSuspensionsController,
} from '../../../../../src/modules/accounts/presentation/http/moderation.controller.js';
import { BearerAuthenticationGuard } from '../../../../../src/modules/accounts/presentation/http/security/bearer-authentication.guard.js';
import { AdministratorAuthorizationGuard } from '../../../../../src/modules/accounts/presentation/http/security/administrator-authorization.guard.js';
import { configureHttpApplication } from '../../../../../src/platform/http/configure-http-application.js';

const ACTOR = '4a84f480-b1cb-4b81-b632-8bb49034b9e7';
const TARGET = '77af9009-08e1-42f5-91d3-516920f0c571';
const REPORT = '9fa02524-f606-4e1d-8cef-bfa0cf884e3e';
const headers = { authorization: 'Bearer test-token' };
const now = new Date();
class RepositoryStub implements ModerationRepositoryPort {
  missing = false;
  error?: ModerationError;
  suspensions: SuspendAccountRecord[] = [];
  resolutions: { reportId: string; actorUserId: string; resolvedAt: Date }[] =
    [];
  report: UserReport = {
    id: REPORT,
    reporterUserId: ACTOR,
    reportedUserId: TARGET,
    reporter: { id: ACTOR, username: 'Reporter' },
    reportedUser: { id: TARGET, username: 'Target' },
    description: 'Issue',
    status: 'OPEN',
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
    resolvedBy: null,
  };
  createReport(
    input: Parameters<ModerationRepositoryPort['createReport']>[0],
  ): Promise<UserReport | null> {
    return Promise.resolve(this.missing ? null : { ...this.report, ...input });
  }
  listReports(): Promise<UserReport[]> {
    return Promise.resolve([this.report]);
  }
  findReport(): Promise<UserReport | null> {
    return Promise.resolve(this.missing ? null : this.report);
  }
  resolveReport(
    input: Parameters<ModerationRepositoryPort['resolveReport']>[0],
  ): Promise<UserReport | null> {
    this.resolutions.push(input);
    return Promise.resolve(
      this.missing
        ? null
        : {
            ...this.report,
            status: 'RESOLVED',
            resolvedAt: input.resolvedAt,
            resolvedBy: { id: input.actorUserId, username: 'Admin' },
          },
    );
  }
  suspendAccount(
    input: SuspendAccountRecord,
  ): Promise<SuspendedAccount | null> {
    this.suspensions.push(input);
    if (this.error) return Promise.reject(this.error);
    return Promise.resolve(
      this.missing
        ? null
        : {
            id: input.targetUserId,
            username: 'Target',
            suspendedUntil: input.suspendedUntil,
          },
    );
  }
}
describe('moderation controllers', () => {
  let app: NestFastifyApplication;
  let repository: RepositoryStub;
  let actor: AuthenticatedAccount;
  beforeEach(async () => {
    repository = new RepositoryStub();
    actor = {
      id: ACTOR,
      username: 'Admin',
      isAdmin: true,
      status: AccountStatus.Active,
    };
    const clock = { now: () => now };
    const module = await Test.createTestingModule({
      controllers: [
        UserReportsController,
        AdministratorReportsController,
        AdministratorSuspensionsController,
      ],
      providers: [
        BearerAuthenticationGuard,
        AdministratorAuthorizationGuard,
        {
          provide: AuthenticateAccessTokenUseCase,
          useValue: { execute: () => Promise.resolve(actor) },
        },
        {
          provide: ReportUserUseCase,
          useValue: new ReportUserUseCase(repository),
        },
        {
          provide: ViewReportsUseCase,
          useValue: new ViewReportsUseCase(repository),
        },
        {
          provide: ResolveReportUseCase,
          useValue: new ResolveReportUseCase(repository, clock),
        },
        {
          provide: SuspendAccountUseCase,
          useValue: new SuspendAccountUseCase(repository, clock),
        },
      ],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    configureHttpApplication(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterEach(async () => {
    await app?.close();
  });
  it('derives the reporter from the authenticated account and rejects spoofed reporter IDs', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/reports',
      headers,
      payload: { reportedUserId: TARGET, description: ' Issue ' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      reporterUserId: ACTOR,
      description: 'Issue',
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/reports',
          headers,
          payload: {
            reportedUserId: TARGET,
            reporterUserId: TARGET,
            description: 'Issue',
          },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('maps self-report to 403 and a missing target to 404', async () => {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/reports',
          headers,
          payload: { reportedUserId: ACTOR, description: 'Issue' },
        })
      ).statusCode,
    ).toBe(403);
    repository.missing = true;
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/reports',
          headers,
          payload: { reportedUserId: TARGET, description: 'Issue' },
        })
      ).statusCode,
    ).toBe(404);
  });
  it('uses administrator guards for listing and resolution', async () => {
    actor.isAdmin = false;
    expect(
      (await app.inject({ method: 'GET', url: '/api/admin/reports', headers }))
        .statusCode,
    ).toBe(403);
    actor.isAdmin = true;
    expect(
      (await app.inject({ method: 'GET', url: '/api/admin/reports', headers }))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/admin/reports/${REPORT}/resolve`,
          headers,
          payload: { actorUserId: TARGET },
        })
      ).statusCode,
    ).toBe(200);
    expect(repository.resolutions[0]?.actorUserId).toBe(ACTOR);
  });
  it('derives the suspending administrator and validates timezone/self-suspension', async () => {
    const suspendedUntil = new Date(now.getTime() + 3600000).toISOString();
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/admin/accounts/${ACTOR}/suspension`,
          headers,
          payload: { suspendedUntil },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/admin/accounts/${TARGET}/suspension`,
          headers,
          payload: { suspendedUntil: '2027-01-01T12:00:00' },
        })
      ).statusCode,
    ).toBe(400);
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/admin/accounts/${TARGET}/suspension`,
      headers,
      payload: { suspendedUntil },
    });
    expect(response.statusCode).toBe(200);
    expect(repository.suspensions[0]?.actorUserId).toBe(ACTOR);
  });
  it.each([
    ['LAST_ADMINISTRATOR_REQUIRED', 409],
    ['ACCOUNT_NOT_SUSPENDABLE', 409],
    ['ADMINISTRATOR_PRIVILEGES_REQUIRED', 403],
  ] as const)('maps %s to a clear HTTP response', async (code, status) => {
    repository.error = new ModerationError(code, 'Operation blocked.');
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/admin/accounts/${TARGET}/suspension`,
      headers,
      payload: {
        suspendedUntil: new Date(now.getTime() + 3600000).toISOString(),
      },
    });
    expect(response.statusCode).toBe(status);
    expect(response.json()).toMatchObject({ code });
  });
});
