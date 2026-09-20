import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';

import { AccountAlreadyExistsError } from '../../../../../src/modules/accounts/application/errors/account-already-exists.error.js';
import { EmailVerificationError } from '../../../../../src/modules/accounts/application/errors/email-verification.error.js';
import { VerificationEmailRateLimitError } from '../../../../../src/modules/accounts/application/errors/verification-email-rate-limit.error.js';
import type { ResendVerificationEmailInput } from '../../../../../src/modules/accounts/application/use-cases/resend-verification-email.use-case.js';
import { ResendVerificationEmailUseCase } from '../../../../../src/modules/accounts/application/use-cases/resend-verification-email.use-case.js';
import type {
  RegisterAccountInput,
  RegisterAccountResult,
} from '../../../../../src/modules/accounts/application/use-cases/register-account.use-case.js';
import { RegisterWithEmailVerificationUseCase } from '../../../../../src/modules/accounts/application/use-cases/register-with-email-verification.use-case.js';
import type { VerifyEmailInput } from '../../../../../src/modules/accounts/application/use-cases/verify-email.use-case.js';
import { VerifyEmailUseCase } from '../../../../../src/modules/accounts/application/use-cases/verify-email.use-case.js';
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

class StubVerifyEmailUseCase {
  readonly inputs: VerifyEmailInput[] = [];
  error?: Error;

  execute(input: VerifyEmailInput): Promise<void> {
    this.inputs.push(input);

    if (this.error) {
      return Promise.reject(this.error);
    }

    return Promise.resolve();
  }
}

class StubResendVerificationEmailUseCase {
  readonly inputs: ResendVerificationEmailInput[] = [];
  error?: Error;

  execute(input: ResendVerificationEmailInput): Promise<void> {
    this.inputs.push(input);

    if (this.error) {
      return Promise.reject(this.error);
    }

    return Promise.resolve();
  }
}

describe('AccountsController', () => {
  let app: NestFastifyApplication;
  let registerUseCase: StubRegisterAccountUseCase;
  let resendVerificationEmailUseCase: StubResendVerificationEmailUseCase;
  let verifyEmailUseCase: StubVerifyEmailUseCase;

  beforeEach(async () => {
    registerUseCase = new StubRegisterAccountUseCase();
    resendVerificationEmailUseCase = new StubResendVerificationEmailUseCase();
    verifyEmailUseCase = new StubVerifyEmailUseCase();
    const moduleRef = await Test.createTestingModule({
      controllers: [AccountsController],
      providers: [
        {
          provide: RegisterWithEmailVerificationUseCase,
          useValue: registerUseCase,
        },
        {
          provide: ResendVerificationEmailUseCase,
          useValue: resendVerificationEmailUseCase,
        },
        {
          provide: VerifyEmailUseCase,
          useValue: verifyEmailUseCase,
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
    expect(registerUseCase.inputs).toEqual([VALID_REQUEST]);
  });

  it('rejects a malformed request before invoking the use case', async () => {
    const response = await app.inject({
      method: 'POST',
      payload: { username: 'Arthur3219' },
      url: '/api/accounts/register',
    });

    expect(response.statusCode).toBe(400);
    expect(registerUseCase.inputs).toHaveLength(0);
  });

  it('maps domain validation failures to HTTP 400', async () => {
    registerUseCase.error = new AccountValidationError(
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
    registerUseCase.error = new AccountAlreadyExistsError('username');

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
    expect(response.json()).toHaveProperty(
      'paths./api/accounts/verify-email.post.responses.204',
    );
    expect(response.json()).toHaveProperty(
      'paths./api/accounts/verify-email/resend.post.responses.204',
    );
  });

  it('accepts a verification email resend without exposing account state', async () => {
    const request = { email: 'student@u.nus.edu' };

    const response = await app.inject({
      method: 'POST',
      payload: request,
      url: '/api/accounts/verify-email/resend',
    });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expect(resendVerificationEmailUseCase.inputs).toEqual([request]);
  });

  it('maps a resend rate limit to HTTP 429', async () => {
    resendVerificationEmailUseCase.error = new VerificationEmailRateLimitError(
      42,
    );

    const response = await app.inject({
      method: 'POST',
      payload: { email: 'student@u.nus.edu' },
      url: '/api/accounts/verify-email/resend',
    });

    expect(response.statusCode).toBe(429);
    expect(response.headers['retry-after']).toBe('42');
    expect(response.json()).toMatchObject({
      code: 'VERIFICATION_EMAIL_RESEND_RATE_LIMITED',
      field: 'email',
      retryAfterSeconds: 42,
    });
  });

  it('rejects a malformed resend request before invoking the use case', async () => {
    const response = await app.inject({
      method: 'POST',
      payload: {},
      url: '/api/accounts/verify-email/resend',
    });

    expect(response.statusCode).toBe(400);
    expect(resendVerificationEmailUseCase.inputs).toHaveLength(0);
  });

  it('verifies an email address without returning private data', async () => {
    const request = { code: '042731', email: 'student@u.nus.edu' };

    const response = await app.inject({
      method: 'POST',
      payload: request,
      url: '/api/accounts/verify-email',
    });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expect(verifyEmailUseCase.inputs).toEqual([request]);
  });

  it('rejects malformed verification codes before invoking the use case', async () => {
    const response = await app.inject({
      method: 'POST',
      payload: { code: '12345', email: 'student@u.nus.edu' },
      url: '/api/accounts/verify-email',
    });

    expect(response.statusCode).toBe(400);
    expect(verifyEmailUseCase.inputs).toHaveLength(0);
  });

  it('maps failed email verification to HTTP 400', async () => {
    verifyEmailUseCase.error = new EmailVerificationError(
      'VERIFICATION_CODE_INVALID_OR_EXPIRED',
      'Verification code is invalid or expired.',
    );

    const response = await app.inject({
      method: 'POST',
      payload: { code: '042731', email: 'student@u.nus.edu' },
      url: '/api/accounts/verify-email',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: 'VERIFICATION_CODE_INVALID_OR_EXPIRED',
      field: 'code',
    });
  });
});
