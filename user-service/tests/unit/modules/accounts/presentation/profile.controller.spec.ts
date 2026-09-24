import type { INestApplication } from '@nestjs/common';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';

import { AccountAlreadyExistsError } from '../../../../../src/modules/accounts/application/errors/account-already-exists.error.js';
import type { AuthenticatedAccount } from '../../../../../src/modules/accounts/application/ports/authentication-repository.port.js';
import type { AccountProfile } from '../../../../../src/modules/accounts/application/ports/profile-repository.port.js';
import { AuthenticateAccessTokenUseCase } from '../../../../../src/modules/accounts/application/use-cases/authenticate-access-token.use-case.js';
import type { ChangePasswordInput } from '../../../../../src/modules/accounts/application/use-cases/change-password.use-case.js';
import { ChangePasswordUseCase } from '../../../../../src/modules/accounts/application/use-cases/change-password.use-case.js';
import { GetProfileUseCase } from '../../../../../src/modules/accounts/application/use-cases/get-profile.use-case.js';
import type { UpdatePhoneNumberInput } from '../../../../../src/modules/accounts/application/use-cases/update-phone-number.use-case.js';
import { UpdatePhoneNumberUseCase } from '../../../../../src/modules/accounts/application/use-cases/update-phone-number.use-case.js';
import type { UpdateUsernameInput } from '../../../../../src/modules/accounts/application/use-cases/update-username.use-case.js';
import { UpdateUsernameUseCase } from '../../../../../src/modules/accounts/application/use-cases/update-username.use-case.js';
import { AccountStatus } from '../../../../../src/modules/accounts/domain/account-status.js';
import { ProfileController } from '../../../../../src/modules/accounts/presentation/http/profile.controller.js';
import { BearerAuthenticationGuard } from '../../../../../src/modules/accounts/presentation/http/security/bearer-authentication.guard.js';
import { configureHttpApplication } from '../../../../../src/platform/http/configure-http-application.js';

const USER_ID = '4a84f480-b1cb-4b81-b632-8bb49034b9e7';
const ACCOUNT: AuthenticatedAccount = {
  id: USER_ID,
  isAdmin: false,
  status: AccountStatus.Active,
  username: 'Arthur3219',
};
const PROFILE: AccountProfile = {
  createdAt: new Date('2026-09-19T00:00:00.000Z'),
  email: 'student@u.nus.edu',
  emailVerifiedAt: new Date('2026-09-19T01:00:00.000Z'),
  id: USER_ID,
  isAdmin: false,
  phoneNumber: '91234567',
  status: AccountStatus.Active,
  updatedAt: new Date('2026-09-19T01:00:00.000Z'),
  username: 'Arthur3219',
};

class StubAuthenticateAccessTokenUseCase {
  tokens: string[] = [];

  execute(token: string): Promise<AuthenticatedAccount> {
    this.tokens.push(token);
    return Promise.resolve(ACCOUNT);
  }
}

class StubGetProfileUseCase {
  userIds: string[] = [];

  execute(userId: string): Promise<AccountProfile> {
    this.userIds.push(userId);
    return Promise.resolve(PROFILE);
  }
}

class StubUpdatePhoneNumberUseCase {
  error?: Error;
  inputs: UpdatePhoneNumberInput[] = [];

  execute(input: UpdatePhoneNumberInput): Promise<AccountProfile> {
    this.inputs.push(input);
    return this.error
      ? Promise.reject(this.error)
      : Promise.resolve({ ...PROFILE, phoneNumber: input.phoneNumber });
  }
}

class StubChangePasswordUseCase {
  inputs: ChangePasswordInput[] = [];

  execute(input: ChangePasswordInput): Promise<void> {
    this.inputs.push(input);
    return Promise.resolve();
  }
}

class StubUpdateUsernameUseCase {
  error?: Error;
  inputs: UpdateUsernameInput[] = [];

  execute(input: UpdateUsernameInput): Promise<AccountProfile> {
    this.inputs.push(input);
    return this.error
      ? Promise.reject(this.error)
      : Promise.resolve({ ...PROFILE, username: input.username });
  }
}

describe('ProfileController', () => {
  let app: NestFastifyApplication;
  let authenticate: StubAuthenticateAccessTokenUseCase;
  let changePassword: StubChangePasswordUseCase;
  let getProfile: StubGetProfileUseCase;
  let updatePhone: StubUpdatePhoneNumberUseCase;
  let updateUsername: StubUpdateUsernameUseCase;

  beforeEach(async () => {
    authenticate = new StubAuthenticateAccessTokenUseCase();
    changePassword = new StubChangePasswordUseCase();
    getProfile = new StubGetProfileUseCase();
    updatePhone = new StubUpdatePhoneNumberUseCase();
    updateUsername = new StubUpdateUsernameUseCase();
    const moduleRef = await Test.createTestingModule({
      controllers: [ProfileController],
      providers: [
        BearerAuthenticationGuard,
        { provide: AuthenticateAccessTokenUseCase, useValue: authenticate },
        { provide: ChangePasswordUseCase, useValue: changePassword },
        { provide: GetProfileUseCase, useValue: getProfile },
        { provide: UpdatePhoneNumberUseCase, useValue: updatePhone },
        { provide: UpdateUsernameUseCase, useValue: updateUsername },
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

  it('rejects a protected request without a bearer token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/accounts/me',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      code: 'ACCESS_TOKEN_INVALID_OR_EXPIRED',
    });
    expect(authenticate.tokens).toHaveLength(0);
  });

  it('returns the authenticated account profile without credential data', async () => {
    const response = await app.inject({
      headers: { authorization: 'Bearer signed-access-token' },
      method: 'GET',
      url: '/api/accounts/me',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toMatchObject({
      email: PROFILE.email,
      id: USER_ID,
      phoneNumber: PROFILE.phoneNumber,
    });
    expect(response.json()).not.toHaveProperty('passwordHash');
    expect(authenticate.tokens).toEqual(['signed-access-token']);
    expect(getProfile.userIds).toEqual([USER_ID]);
  });

  it('changes the authenticated account phone number', async () => {
    const response = await app.inject({
      headers: { authorization: 'Bearer signed-access-token' },
      method: 'PATCH',
      payload: { phoneNumber: '87654321' },
      url: '/api/accounts/me/phone-number',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ phoneNumber: '87654321' });
    expect(updatePhone.inputs).toEqual([
      { phoneNumber: '87654321', userId: USER_ID },
    ]);
  });

  it('maps a duplicate phone number to HTTP 409', async () => {
    updatePhone.error = new AccountAlreadyExistsError('phoneNumber');

    const response = await app.inject({
      headers: { authorization: 'Bearer signed-access-token' },
      method: 'PATCH',
      payload: { phoneNumber: '87654321' },
      url: '/api/accounts/me/phone-number',
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: 'PHONE_NUMBER_ALREADY_REGISTERED',
    });
  });

  it('changes only the authenticated account username and returns its profile', async () => {
    const response = await app.inject({
      headers: { authorization: 'Bearer signed-access-token' },
      method: 'PATCH',
      payload: { username: 'Arthur2026' },
      url: '/api/accounts/me/username',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toEqual({
      ...PROFILE,
      createdAt: PROFILE.createdAt.toISOString(),
      emailVerifiedAt: PROFILE.emailVerifiedAt?.toISOString(),
      updatedAt: PROFILE.updatedAt.toISOString(),
      username: 'Arthur2026',
    });
    expect(updateUsername.inputs).toEqual([
      { userId: USER_ID, username: 'Arthur2026' },
    ]);
  });

  it('rejects attempts to change other account fields with the username', async () => {
    const response = await app.inject({
      headers: { authorization: 'Bearer signed-access-token' },
      method: 'PATCH',
      payload: {
        email: 'changed@u.nus.edu',
        id: '77af9009-08e1-42f5-91d3-516920f0c571',
        isAdmin: true,
        status: AccountStatus.Banned,
        username: 'Arthur2026',
      },
      url: '/api/accounts/me/username',
    });

    expect(response.statusCode).toBe(400);
    expect(updateUsername.inputs).toHaveLength(0);
  });

  it('maps a duplicate username to HTTP 409', async () => {
    updateUsername.error = new AccountAlreadyExistsError('username');

    const response = await app.inject({
      headers: { authorization: 'Bearer signed-access-token' },
      method: 'PATCH',
      payload: { username: 'OtherStudent' },
      url: '/api/accounts/me/username',
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: 'USERNAME_ALREADY_REGISTERED',
    });
  });

  it('changes the password without returning credential data', async () => {
    const request = {
      currentPassword: 'Current!Pass',
      newPassword: 'NewStrong!Pass',
    };
    const response = await app.inject({
      headers: { authorization: 'Bearer signed-access-token' },
      method: 'PATCH',
      payload: request,
      url: '/api/accounts/me/password',
    });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expect(changePassword.inputs).toEqual([{ ...request, userId: USER_ID }]);
  });

  it('publishes bearer-protected profile contracts in OpenAPI', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/docs-json' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveProperty(
      'paths./api/accounts/me.get.responses.200',
    );
    expect(response.json()).toHaveProperty(
      'paths./api/accounts/me/phone-number.patch.responses.200',
    );
    expect(response.json()).toHaveProperty(
      'paths./api/accounts/me/password.patch.responses.204',
    );
    expect(response.json()).toHaveProperty(
      'paths./api/accounts/me/username.patch.responses.200',
    );
    expect(response.json()).toHaveProperty(
      'paths./api/accounts/me.get.security',
    );
    expect(response.json()).toHaveProperty(
      'components.securitySchemes.bearer.type',
      'http',
    );
  });
});
