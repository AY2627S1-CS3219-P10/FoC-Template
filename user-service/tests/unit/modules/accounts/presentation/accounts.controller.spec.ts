import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';

import { AccountAlreadyExistsError } from '../../../../../src/modules/accounts/application/errors/account-already-exists.error.js';
import type {
  RegisterAccountInput,
  RegisterAccountResult,
} from '../../../../../src/modules/accounts/application/use-cases/register-account.use-case.js';
import { RegisterAccountUseCase } from '../../../../../src/modules/accounts/application/use-cases/register-account.use-case.js';
import { AccountStatus } from '../../../../../src/modules/accounts/domain/account-status.js';
import { AccountValidationError } from '../../../../../src/modules/accounts/domain/account-validation.error.js';
import { AccountsController } from '../../../../../src/modules/accounts/presentation/http/accounts.controller.js';
import { configureHttpApplication } from '../../../../../src/platform/http/configure-http-application.js';

const VALID_REQUEST = {
  email: 'student@u.nus.edu',
  password: 'Strong!Pass',
  phoneNumber: '91234567',
  username: 'Arthur3219',
};

const REGISTERED_ACCOUNT: RegisterAccountResult = {
  email: 'student@u.nus.edu',
  id: '4a84f480-b1cb-4b81-b632-8bb49034b9e7',
  isAdmin: false,
  phoneNumber: '91234567',
  status: AccountStatus.PendingVerification,
  username: 'Arthur3219',
};

class StubRegisterAccountUseCase {
  readonly inputs: RegisterAccountInput[] = [];
  error?: Error;

  execute(input: RegisterAccountInput): Promise<RegisterAccountResult> {
    this.inputs.push(input);

    if (this.error) {
      return Promise.reject(this.error);
    }

    return Promise.resolve(REGISTERED_ACCOUNT);
  }
}

describe('AccountsController', () => {
  let app: NestFastifyApplication;
  let useCase: StubRegisterAccountUseCase;

  beforeEach(async () => {
    useCase = new StubRegisterAccountUseCase();
    const moduleRef = await Test.createTestingModule({
      controllers: [AccountsController],
      providers: [
        {
          provide: RegisterAccountUseCase,
          useValue: useCase,
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

  it('returns only safe public account information', async () => {
    const response = await app.inject({
      method: 'POST',
      payload: VALID_REQUEST,
      url: '/api/accounts/register',
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      id: REGISTERED_ACCOUNT.id,
      status: AccountStatus.PendingVerification,
      username: REGISTERED_ACCOUNT.username,
    });
    expect(response.json()).not.toHaveProperty('email');
    expect(response.json()).not.toHaveProperty('phoneNumber');
    expect(response.json()).not.toHaveProperty('password');
    expect(useCase.inputs).toEqual([VALID_REQUEST]);
  });

  it('rejects a malformed request before invoking the use case', async () => {
    const response = await app.inject({
      method: 'POST',
      payload: { username: 'Arthur3219' },
      url: '/api/accounts/register',
    });

    expect(response.statusCode).toBe(400);
    expect(useCase.inputs).toHaveLength(0);
  });

  it('maps domain validation failures to HTTP 400', async () => {
    useCase.error = new AccountValidationError(
      'email',
      'EMAIL_INVALID_NUS_ADDRESS',
      'Email address must be a valid u.nus.edu address.',
    );

    const response = await app.inject({
      method: 'POST',
      payload: VALID_REQUEST,
      url: '/api/accounts/register',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: 'EMAIL_INVALID_NUS_ADDRESS',
      field: 'email',
    });
  });

  it('maps duplicate accounts to HTTP 409', async () => {
    useCase.error = new AccountAlreadyExistsError('username');

    const response = await app.inject({
      method: 'POST',
      payload: VALID_REQUEST,
      url: '/api/accounts/register',
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: 'USERNAME_ALREADY_REGISTERED',
      field: 'username',
    });
  });

  it('publishes the registration OpenAPI contract', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/docs-json',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveProperty(
      'paths./api/accounts/register.post.responses.201',
    );
  });
});
