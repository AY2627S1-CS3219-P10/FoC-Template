import type { INestApplication } from '@nestjs/common';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';

import { TemporarySuspensionError } from '../../../../../src/modules/accounts/application/errors/temporary-suspension.error.js';
import { UserReportError } from '../../../../../src/modules/accounts/application/errors/user-report.error.js';
import type { AuthenticatedAccount } from '../../../../../src/modules/accounts/application/ports/authentication-repository.port.js';
import type { UserReportRecord } from '../../../../../src/modules/accounts/application/ports/user-report-repository.port.js';
import { UserReportStatus } from '../../../../../src/modules/accounts/application/ports/user-report-repository.port.js';
import { AuthenticateAccessTokenUseCase } from '../../../../../src/modules/accounts/application/use-cases/authenticate-access-token.use-case.js';
import { CreateUserReportUseCase } from '../../../../../src/modules/accounts/application/use-cases/create-user-report.use-case.js';
import { ListUserReportsUseCase } from '../../../../../src/modules/accounts/application/use-cases/list-user-reports.use-case.js';
import { ResolveUserReportUseCase } from '../../../../../src/modules/accounts/application/use-cases/resolve-user-report.use-case.js';
import { SuspendAccountUseCase } from '../../../../../src/modules/accounts/application/use-cases/suspend-account.use-case.js';
import { AccountStatus } from '../../../../../src/modules/accounts/domain/account-status.js';
import { AdministratorReportsController } from '../../../../../src/modules/accounts/presentation/http/administrator-reports.controller.js';
import { AdministratorSuspensionsController } from '../../../../../src/modules/accounts/presentation/http/administrator-suspensions.controller.js';
import { UserReportsController } from '../../../../../src/modules/accounts/presentation/http/user-reports.controller.js';
import { AdministratorAuthorizationGuard } from '../../../../../src/modules/accounts/presentation/http/security/administrator-authorization.guard.js';
import { BearerAuthenticationGuard } from '../../../../../src/modules/accounts/presentation/http/security/bearer-authentication.guard.js';
import { configureHttpApplication } from '../../../../../src/platform/http/configure-http-application.js';

const ACTOR_ID = '4a84f480-b1cb-4b81-b632-8bb49034b9e7';
const TARGET_ID = '77af9009-08e1-42f5-91d3-516920f0c571';
const REPORT_ID = '9fa02524-f606-4e1d-8cef-bfa0cf884e3e';
const NOW = new Date('2026-10-12T08:00:00.000Z');
const REPORT: UserReportRecord = {
  createdAt: NOW,
  description: 'Repeated abusive messages',
  id: REPORT_ID,
  reportedUser: { id: TARGET_ID, username: 'TargetUser' },
  reporter: { id: ACTOR_ID, username: 'ActorUser' },
  resolvedAt: null,
  status: UserReportStatus.Open,
  updatedAt: NOW,
};

class StubAuthenticate {
  account: AuthenticatedAccount = {
    id: ACTOR_ID,
    isAdmin: true,
    status: AccountStatus.Active,
    username: 'ActorUser',
  };
  execute(): Promise<AuthenticatedAccount> {
    return Promise.resolve(this.account);
  }
}

class StubUseCase<TInput, TResult> {
  error?: Error;
  inputs: TInput[] = [];
  constructor(public result: TResult) {}
  execute(input: TInput): Promise<TResult> {
    this.inputs.push(input);
    return this.error
      ? Promise.reject(this.error)
      : Promise.resolve(this.result);
  }
}

describe('report and suspension controllers', () => {
  let app: NestFastifyApplication;
  let authenticate: StubAuthenticate;
  let create: StubUseCase<
    { description: string; reportedUserId: string; reporterUserId: string },
    UserReportRecord
  >;
  let list: { execute(): Promise<UserReportRecord[]> };
  let resolve: StubUseCase<
    { reportId: string; resolvedByAdminId: string },
    UserReportRecord
  >;
  let suspend: StubUseCase<
    { actorUserId: string; suspendedUntil: Date; targetUserId: string },
    { id: string; suspendedUntil: Date; username: string }
  >;

  beforeEach(async () => {
    authenticate = new StubAuthenticate();
    create = new StubUseCase(REPORT);
    list = { execute: () => Promise.resolve([REPORT]) };
    resolve = new StubUseCase({
      ...REPORT,
      resolvedAt: NOW,
      status: UserReportStatus.Resolved,
    });
    suspend = new StubUseCase({
      id: TARGET_ID,
      suspendedUntil: new Date('2026-10-13T08:00:00.000Z'),
      username: 'TargetUser',
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [
        UserReportsController,
        AdministratorReportsController,
        AdministratorSuspensionsController,
      ],
      providers: [
        AdministratorAuthorizationGuard,
        BearerAuthenticationGuard,
        { provide: AuthenticateAccessTokenUseCase, useValue: authenticate },
        { provide: CreateUserReportUseCase, useValue: create },
        { provide: ListUserReportsUseCase, useValue: list },
        { provide: ResolveUserReportUseCase, useValue: resolve },
        { provide: SuspendAccountUseCase, useValue: suspend },
      ],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    configureHttpApplication(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => (app as INestApplication).close());

  it('derives the reporter from authentication and returns safe identities', async () => {
    const response = await app.inject({
      headers: { authorization: 'Bearer token' },
      method: 'POST',
      payload: { description: REPORT.description, reportedUserId: TARGET_ID },
      url: '/api/accounts/reports',
    });
    expect(response.statusCode).toBe(201);
    expect(create.inputs).toEqual([
      {
        description: REPORT.description,
        reportedUserId: TARGET_ID,
        reporterUserId: ACTOR_ID,
      },
    ]);
    expect(response.json()).not.toHaveProperty('reporter.email');
  });

  it('maps self-report and missing-target errors', async () => {
    create.error = new UserReportError('SELF_REPORT_FORBIDDEN', 'Rejected.');
    let response = await app.inject({
      headers: { authorization: 'Bearer token' },
      method: 'POST',
      payload: { description: 'Issue', reportedUserId: TARGET_ID },
      url: '/api/accounts/reports',
    });
    expect(response.statusCode).toBe(400);

    create.error = new UserReportError(
      'REPORTED_ACCOUNT_NOT_FOUND',
      'Missing.',
    );
    response = await app.inject({
      headers: { authorization: 'Bearer token' },
      method: 'POST',
      payload: { description: 'Issue', reportedUserId: TARGET_ID },
      url: '/api/accounts/reports',
    });
    expect(response.statusCode).toBe(404);
  });

  it('allows admins to list and resolve reports but rejects students', async () => {
    let response = await app.inject({
      headers: { authorization: 'Bearer token' },
      method: 'GET',
      url: '/api/admin/reports',
    });
    expect(response.statusCode).toBe(200);

    response = await app.inject({
      headers: { authorization: 'Bearer token' },
      method: 'PATCH',
      url: `/api/admin/reports/${REPORT_ID}/resolve`,
    });
    expect(response.statusCode).toBe(200);
    expect(resolve.inputs).toEqual([
      { reportId: REPORT_ID, resolvedByAdminId: ACTOR_ID },
    ]);

    authenticate.account = { ...authenticate.account, isAdmin: false };
    response = await app.inject({
      headers: { authorization: 'Bearer token' },
      method: 'GET',
      url: '/api/admin/reports',
    });
    expect(response.statusCode).toBe(403);
  });

  it('suspends another account and maps safety errors', async () => {
    const expiry = '2026-10-13T08:00:00.000Z';
    let response = await app.inject({
      headers: { authorization: 'Bearer token' },
      method: 'PATCH',
      payload: { suspendedUntil: expiry },
      url: `/api/admin/accounts/${TARGET_ID}/suspension`,
    });
    expect(response.statusCode).toBe(200);
    expect(suspend.inputs).toEqual([
      {
        actorUserId: ACTOR_ID,
        suspendedUntil: new Date(expiry),
        targetUserId: TARGET_ID,
      },
    ]);

    suspend.error = new TemporarySuspensionError(
      'SELF_SUSPENSION_FORBIDDEN',
      'Rejected.',
    );
    response = await app.inject({
      headers: { authorization: 'Bearer token' },
      method: 'PATCH',
      payload: { suspendedUntil: expiry },
      url: `/api/admin/accounts/${TARGET_ID}/suspension`,
    });
    expect(response.statusCode).toBe(403);

    suspend.error = new TemporarySuspensionError(
      'LAST_ADMINISTRATOR_REQUIRED',
      'Rejected.',
    );
    response = await app.inject({
      headers: { authorization: 'Bearer token' },
      method: 'PATCH',
      payload: { suspendedUntil: expiry },
      url: `/api/admin/accounts/${TARGET_ID}/suspension`,
    });
    expect(response.statusCode).toBe(409);
  });

  it('publishes OpenAPI contracts for all new endpoints', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/docs-json' });
    const document = response.json<Record<string, unknown>>();
    expect(document).toHaveProperty('paths./api/accounts/reports.post');
    expect(document).toHaveProperty('paths./api/admin/reports.get.security');
    expect(document).toHaveProperty(
      'paths./api/admin/reports/{reportId}/resolve.patch.security',
    );
    expect(document).toHaveProperty(
      'paths./api/admin/accounts/{accountId}/suspension.patch.security',
    );
  });
});
