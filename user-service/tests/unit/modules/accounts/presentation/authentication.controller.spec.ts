import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';

import { AuthenticationError } from '../../../../../src/modules/accounts/application/errors/authentication.error.js';
import type {
  AuthenticationResult,
  LoginInput,
} from '../../../../../src/modules/accounts/application/use-cases/login.use-case.js';
import { LoginUseCase } from '../../../../../src/modules/accounts/application/use-cases/login.use-case.js';
import type { LogoutInput } from '../../../../../src/modules/accounts/application/use-cases/logout.use-case.js';
import { LogoutUseCase } from '../../../../../src/modules/accounts/application/use-cases/logout.use-case.js';
import type { RefreshSessionInput } from '../../../../../src/modules/accounts/application/use-cases/refresh-session.use-case.js';
import { RefreshSessionUseCase } from '../../../../../src/modules/accounts/application/use-cases/refresh-session.use-case.js';
import { AuthenticationController } from '../../../../../src/modules/accounts/presentation/http/authentication.controller.js';
import { configureHttpApplication } from '../../../../../src/platform/http/configure-http-application.js';

const REFRESH_TOKEN = 'r'.repeat(43);
const AUTHENTICATION_RESULT: AuthenticationResult = {
  accessToken: 'signed-access-token',
  expiresIn: 900,
  refreshToken: REFRESH_TOKEN,
  tokenType: 'Bearer',
  user: {
    id: '4a84f480-b1cb-4b81-b632-8bb49034b9e7',
    isAdmin: false,
    username: 'Arthur3219',
  },
};

class StubLoginUseCase {
  readonly inputs: LoginInput[] = [];
  error?: Error;

  execute(input: LoginInput): Promise<AuthenticationResult> {
    this.inputs.push(input);
    return this.error
      ? Promise.reject(this.error)
      : Promise.resolve(AUTHENTICATION_RESULT);
  }
}

class StubRefreshSessionUseCase {
  readonly inputs: RefreshSessionInput[] = [];
  error?: Error;

  execute(input: RefreshSessionInput): Promise<AuthenticationResult> {
    this.inputs.push(input);
    return this.error
      ? Promise.reject(this.error)
      : Promise.resolve(AUTHENTICATION_RESULT);
  }
}

class StubLogoutUseCase {
  readonly inputs: LogoutInput[] = [];

  execute(input: LogoutInput): Promise<void> {
    this.inputs.push(input);
    return Promise.resolve();
  }
}

describe('AuthenticationController', () => {
  let app: NestFastifyApplication;
  let loginUseCase: StubLoginUseCase;
  let logoutUseCase: StubLogoutUseCase;
  let refreshSessionUseCase: StubRefreshSessionUseCase;

  beforeEach(async () => {
    loginUseCase = new StubLoginUseCase();
    logoutUseCase = new StubLogoutUseCase();
    refreshSessionUseCase = new StubRefreshSessionUseCase();
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthenticationController],
      providers: [
        { provide: LoginUseCase, useValue: loginUseCase },
        { provide: LogoutUseCase, useValue: logoutUseCase },
        { provide: RefreshSessionUseCase, useValue: refreshSessionUseCase },
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

  it('logs in without returning a password or password hash', async () => {
    const request = { email: 'student@u.nus.edu', password: 'Strong!Pass' };
    const response = await app.inject({
      method: 'POST',
      payload: request,
      url: '/api/auth/login',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['pragma']).toBe('no-cache');
    expect(response.json()).toEqual(AUTHENTICATION_RESULT);
    expect(response.json()).not.toHaveProperty('password');
    expect(response.json()).not.toHaveProperty('passwordHash');
    expect(loginUseCase.inputs).toEqual([request]);
  });

  it('maps invalid credentials to HTTP 401', async () => {
    loginUseCase.error = new AuthenticationError(
      'INVALID_CREDENTIALS',
      'Email address or password is incorrect.',
    );

    const response = await app.inject({
      method: 'POST',
      payload: { email: 'student@u.nus.edu', password: 'Incorrect!Pass' },
      url: '/api/auth/login',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('maps a non-active account to HTTP 403', async () => {
    loginUseCase.error = new AuthenticationError(
      'ACCOUNT_NOT_ACTIVE',
      'Account is not available for login.',
    );

    const response = await app.inject({
      method: 'POST',
      payload: { email: 'student@u.nus.edu', password: 'Strong!Pass' },
      url: '/api/auth/login',
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'ACCOUNT_NOT_ACTIVE' });
  });

  it('rotates a valid refresh token', async () => {
    const response = await app.inject({
      method: 'POST',
      payload: { refreshToken: REFRESH_TOKEN },
      url: '/api/auth/refresh',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(AUTHENTICATION_RESULT);
    expect(refreshSessionUseCase.inputs).toEqual([
      { refreshToken: REFRESH_TOKEN },
    ]);
  });

  it('rejects a malformed refresh token before invoking the use case', async () => {
    const response = await app.inject({
      method: 'POST',
      payload: { refreshToken: 'too-short' },
      url: '/api/auth/refresh',
    });

    expect(response.statusCode).toBe(400);
    expect(refreshSessionUseCase.inputs).toHaveLength(0);
  });

  it('revokes a refresh session without revealing token state', async () => {
    const response = await app.inject({
      method: 'POST',
      payload: { refreshToken: REFRESH_TOKEN },
      url: '/api/auth/logout',
    });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expect(logoutUseCase.inputs).toEqual([{ refreshToken: REFRESH_TOKEN }]);
  });

  it('publishes login, refresh, and logout OpenAPI contracts', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/docs-json',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveProperty(
      'paths./api/auth/login.post.responses.200',
    );
    expect(response.json()).toHaveProperty(
      'paths./api/auth/refresh.post.responses.200',
    );
    expect(response.json()).toHaveProperty(
      'paths./api/auth/logout.post.responses.204',
    );
  });
});
