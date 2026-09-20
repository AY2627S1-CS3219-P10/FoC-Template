import type { INestApplication } from '@nestjs/common';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';

import { AdministratorPrivilegeError } from '../../../../../src/modules/accounts/application/errors/administrator-privilege.error.js';
import type { AdministratorPrivilegeAccount } from '../../../../../src/modules/accounts/application/ports/administrator-privilege-repository.port.js';
import type { AuthenticatedAccount } from '../../../../../src/modules/accounts/application/ports/authentication-repository.port.js';
import type { ChangeAdministratorPrivilegeInput } from '../../../../../src/modules/accounts/application/use-cases/change-administrator-privilege.use-case.js';
import { ChangeAdministratorPrivilegeUseCase } from '../../../../../src/modules/accounts/application/use-cases/change-administrator-privilege.use-case.js';
import { AuthenticateAccessTokenUseCase } from '../../../../../src/modules/accounts/application/use-cases/authenticate-access-token.use-case.js';
import { AccountStatus } from '../../../../../src/modules/accounts/domain/account-status.js';
import { AdministratorAccountsController } from '../../../../../src/modules/accounts/presentation/http/administrator-accounts.controller.js';
import { AdministratorAuthorizationGuard } from '../../../../../src/modules/accounts/presentation/http/security/administrator-authorization.guard.js';
import { BearerAuthenticationGuard } from '../../../../../src/modules/accounts/presentation/http/security/bearer-authentication.guard.js';
import { configureHttpApplication } from '../../../../../src/platform/http/configure-http-application.js';

const ACTOR_ID = '4a84f480-b1cb-4b81-b632-8bb49034b9e7';
const TARGET_ID = '77af9009-08e1-42f5-91d3-516920f0c571';

class StubAuthenticateAccessTokenUseCase {
  account: AuthenticatedAccount = {
    id: ACTOR_ID,
    isAdmin: true,
    status: AccountStatus.Active,
    username: 'Administrator1',
  };

  execute(): Promise<AuthenticatedAccount> {
    return Promise.resolve(this.account);
  }
}

class StubChangeAdministratorPrivilegeUseCase {
  error?: Error;
  inputs: ChangeAdministratorPrivilegeInput[] = [];

  execute(
    input: ChangeAdministratorPrivilegeInput,
  ): Promise<AdministratorPrivilegeAccount> {
    this.inputs.push(input);
    return this.error
      ? Promise.reject(this.error)
      : Promise.resolve({
          id: input.targetUserId,
          isAdmin: input.isAdmin,
          username: 'TargetUser',
        });
  }
}

describe('AdministratorAccountsController', () => {
  let app: NestFastifyApplication;
  let authenticate: StubAuthenticateAccessTokenUseCase;
  let changePrivilege: StubChangeAdministratorPrivilegeUseCase;

  beforeEach(async () => {
    authenticate = new StubAuthenticateAccessTokenUseCase();
    changePrivilege = new StubChangeAdministratorPrivilegeUseCase();
    const moduleRef = await Test.createTestingModule({
      controllers: [AdministratorAccountsController],
      providers: [
        AdministratorAuthorizationGuard,
        BearerAuthenticationGuard,
        { provide: AuthenticateAccessTokenUseCase, useValue: authenticate },
        {
          provide: ChangeAdministratorPrivilegeUseCase,
          useValue: changePrivilege,
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

  afterEach(async () => {
    await (app as INestApplication).close();
  });

  it('allows an administrator to promote another account', async () => {
    const response = await app.inject({
      headers: { authorization: 'Bearer administrator-token' },
      method: 'PATCH',
      payload: { isAdmin: true },
      url: `/api/admin/accounts/${TARGET_ID}/administrator`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: TARGET_ID,
      isAdmin: true,
      username: 'TargetUser',
    });
    expect(changePrivilege.inputs).toEqual([
      { actorUserId: ACTOR_ID, isAdmin: true, targetUserId: TARGET_ID },
    ]);
  });

  it('rejects a normal student before invoking privilege management', async () => {
    authenticate.account = { ...authenticate.account, isAdmin: false };

    const response = await app.inject({
      headers: { authorization: 'Bearer student-token' },
      method: 'PATCH',
      payload: { isAdmin: true },
      url: `/api/admin/accounts/${TARGET_ID}/administrator`,
    });

    expect(response.statusCode).toBe(403);
    expect(changePrivilege.inputs).toHaveLength(0);
  });

  it.each([
    ['ADMINISTRATOR_SELF_CHANGE_FORBIDDEN', 403],
    ['ACCOUNT_NOT_FOUND', 404],
    ['LAST_ADMINISTRATOR_REQUIRED', 409],
  ] as const)('maps %s to HTTP %s', async (code, statusCode) => {
    changePrivilege.error = new AdministratorPrivilegeError(code, 'Rejected.');

    const response = await app.inject({
      headers: { authorization: 'Bearer administrator-token' },
      method: 'PATCH',
      payload: { isAdmin: false },
      url: `/api/admin/accounts/${TARGET_ID}/administrator`,
    });

    expect(response.statusCode).toBe(statusCode);
    expect(response.json()).toMatchObject({ code });
  });

  it('publishes the administrator privilege API contract', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/docs-json' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveProperty(
      'paths./api/admin/accounts/{accountId}/administrator.patch.responses.200',
    );
    expect(response.json()).toHaveProperty(
      'paths./api/admin/accounts/{accountId}/administrator.patch.security',
    );
  });
});
