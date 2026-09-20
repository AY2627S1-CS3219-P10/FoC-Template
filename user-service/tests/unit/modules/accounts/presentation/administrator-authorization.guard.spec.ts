import {
  Controller,
  Get,
  type INestApplication,
} from '@nestjs/common';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';

import type { AuthenticatedAccount } from '../../../../../src/modules/accounts/application/ports/authentication-repository.port.js';
import { AuthenticateAccessTokenUseCase } from '../../../../../src/modules/accounts/application/use-cases/authenticate-access-token.use-case.js';
import { AccountStatus } from '../../../../../src/modules/accounts/domain/account-status.js';
import { AdministratorAuthorizationGuard } from '../../../../../src/modules/accounts/presentation/http/security/administrator-authorization.guard.js';
import { AdministratorOnly } from '../../../../../src/modules/accounts/presentation/http/security/administrator-only.decorator.js';
import { BearerAuthenticationGuard } from '../../../../../src/modules/accounts/presentation/http/security/bearer-authentication.guard.js';
import { configureHttpApplication } from '../../../../../src/platform/http/configure-http-application.js';

class StubAuthenticateAccessTokenUseCase {
  account: AuthenticatedAccount = {
    id: '4a84f480-b1cb-4b81-b632-8bb49034b9e7',
    isAdmin: false,
    status: AccountStatus.Active,
    username: 'Student1',
  };

  execute(): Promise<AuthenticatedAccount> {
    return Promise.resolve(this.account);
  }
}

@Controller('admin-test')
@AdministratorOnly()
class AdministratorTestController {
  @Get()
  getProtectedResource(): { allowed: true } {
    return { allowed: true };
  }
}

describe('AdministratorAuthorizationGuard', () => {
  let app: NestFastifyApplication;
  let authenticate: StubAuthenticateAccessTokenUseCase;

  beforeEach(async () => {
    authenticate = new StubAuthenticateAccessTokenUseCase();
    const moduleRef = await Test.createTestingModule({
      controllers: [AdministratorTestController],
      providers: [
        AdministratorAuthorizationGuard,
        BearerAuthenticationGuard,
        { provide: AuthenticateAccessTokenUseCase, useValue: authenticate },
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

  it('rejects an authenticated student with HTTP 403', async () => {
    const response = await app.inject({
      headers: { authorization: 'Bearer signed-access-token' },
      method: 'GET',
      url: '/api/admin-test',
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      code: 'ADMINISTRATOR_PRIVILEGES_REQUIRED',
    });
  });

  it('allows a currently privileged administrator', async () => {
    authenticate.account = { ...authenticate.account, isAdmin: true };

    const response = await app.inject({
      headers: { authorization: 'Bearer signed-access-token' },
      method: 'GET',
      url: '/api/admin-test',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ allowed: true });
  });
});
