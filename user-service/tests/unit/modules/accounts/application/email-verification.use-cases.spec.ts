import type { EmailVerificationError } from '../../../../../src/modules/accounts/application/errors/email-verification.error.js';
import type { ClockPort } from '../../../../../src/modules/accounts/application/ports/clock.port.js';
import type {
  EmailVerificationRepositoryPort,
  IssueEmailVerificationCodeRecord,
  VerifyEmailInput as RepositoryVerifyEmailInput,
} from '../../../../../src/modules/accounts/application/ports/email-verification-repository.port.js';
import type { IdGeneratorPort } from '../../../../../src/modules/accounts/application/ports/id-generator.port.js';
import type { VerificationCodeGeneratorPort } from '../../../../../src/modules/accounts/application/ports/verification-code-generator.port.js';
import type { VerificationCodeHasherPort } from '../../../../../src/modules/accounts/application/ports/verification-code-hasher.port.js';
import {
  EMAIL_VERIFICATION_CODE_LIFETIME_MS,
  IssueEmailVerificationCodeUseCase,
} from '../../../../../src/modules/accounts/application/use-cases/issue-email-verification-code.use-case.js';
import {
  MAXIMUM_EMAIL_VERIFICATION_ATTEMPTS,
  VerifyEmailUseCase,
} from '../../../../../src/modules/accounts/application/use-cases/verify-email.use-case.js';
import { AccountValidationError } from '../../../../../src/modules/accounts/domain/account-validation.error.js';

const NOW = new Date('2026-09-20T02:00:00.000Z');

class FixedClock implements ClockPort {
  now(): Date {
    return NOW;
  }
}

class StubCodeGenerator implements VerificationCodeGeneratorPort {
  generate(): string {
    return '042731';
  }
}

class StubCodeHasher implements VerificationCodeHasherPort {
  readonly inputs: string[] = [];

  hash(code: string): string {
    this.inputs.push(code);
    return `hashed:${code}`;
  }
}

class StubIdGenerator implements IdGeneratorPort {
  generate(): string {
    return 'a23394c1-c131-4b77-bf0d-c39bc11bf81e';
  }
}

class StubEmailVerificationRepository implements EmailVerificationRepositoryPort {
  issued = true;
  issuedRecords: IssueEmailVerificationCodeRecord[] = [];
  verified = true;
  verificationInputs: RepositoryVerifyEmailInput[] = [];

  findPendingAccountByEmail(): Promise<null> {
    return Promise.resolve(null);
  }

  issueCode(record: IssueEmailVerificationCodeRecord): Promise<boolean> {
    this.issuedRecords.push(record);
    return Promise.resolve(this.issued);
  }

  verifyAndActivate(input: RepositoryVerifyEmailInput): Promise<boolean> {
    this.verificationInputs.push(input);
    return Promise.resolve(this.verified);
  }
}

describe('email verification use cases', () => {
  it('issues a hashed six-digit code that expires after ten minutes', async () => {
    const repository = new StubEmailVerificationRepository();
    const codeHasher = new StubCodeHasher();
    const useCase = new IssueEmailVerificationCodeUseCase({
      clock: new FixedClock(),
      codeGenerator: new StubCodeGenerator(),
      codeHasher,
      idGenerator: new StubIdGenerator(),
      repository,
    });

    await expect(
      useCase.execute('4a84f480-b1cb-4b81-b632-8bb49034b9e7'),
    ).resolves.toEqual({
      code: '042731',
      expiresAt: new Date(NOW.getTime() + EMAIL_VERIFICATION_CODE_LIFETIME_MS),
      verificationId: 'a23394c1-c131-4b77-bf0d-c39bc11bf81e',
    });
    expect(codeHasher.inputs).toEqual(['042731']);
    expect(repository.issuedRecords).toEqual([
      {
        codeHash: 'hashed:042731',
        createdAt: NOW,
        expiresAt: new Date(
          NOW.getTime() + EMAIL_VERIFICATION_CODE_LIFETIME_MS,
        ),
        id: 'a23394c1-c131-4b77-bf0d-c39bc11bf81e',
        userId: '4a84f480-b1cb-4b81-b632-8bb49034b9e7',
      },
    ]);
  });

  it('does not return a code for an account that is not pending', async () => {
    const repository = new StubEmailVerificationRepository();
    repository.issued = false;
    const useCase = new IssueEmailVerificationCodeUseCase({
      clock: new FixedClock(),
      codeGenerator: new StubCodeGenerator(),
      codeHasher: new StubCodeHasher(),
      idGenerator: new StubIdGenerator(),
      repository,
    });

    await expect(
      useCase.execute('4a84f480-b1cb-4b81-b632-8bb49034b9e7'),
    ).rejects.toMatchObject({
      code: 'ACCOUNT_NOT_PENDING_VERIFICATION',
    } satisfies Partial<EmailVerificationError>);
  });

  it('verifies a normalized NUS email with the configured attempt limit', async () => {
    const repository = new StubEmailVerificationRepository();
    const useCase = new VerifyEmailUseCase({
      clock: new FixedClock(),
      codeHasher: new StubCodeHasher(),
      repository,
    });

    await expect(
      useCase.execute({
        code: '042731',
        email: ' Student@U.NUS.EDU ',
      }),
    ).resolves.toBeUndefined();
    expect(repository.verificationInputs).toEqual([
      {
        candidateCodeHash: 'hashed:042731',
        email: 'student@u.nus.edu',
        maximumAttempts: MAXIMUM_EMAIL_VERIFICATION_ATTEMPTS,
        now: NOW,
      },
    ]);
  });

  it('returns one generic error for invalid, expired, or exhausted codes', async () => {
    const repository = new StubEmailVerificationRepository();
    repository.verified = false;
    const useCase = new VerifyEmailUseCase({
      clock: new FixedClock(),
      codeHasher: new StubCodeHasher(),
      repository,
    });

    await expect(
      useCase.execute({ code: '042731', email: 'student@u.nus.edu' }),
    ).rejects.toMatchObject({
      code: 'VERIFICATION_CODE_INVALID_OR_EXPIRED',
    } satisfies Partial<EmailVerificationError>);
  });

  it('rejects malformed codes before accessing persistence', async () => {
    const repository = new StubEmailVerificationRepository();
    const useCase = new VerifyEmailUseCase({
      clock: new FixedClock(),
      codeHasher: new StubCodeHasher(),
      repository,
    });

    await expect(
      useCase.execute({ code: '12345', email: 'student@u.nus.edu' }),
    ).rejects.toBeInstanceOf(AccountValidationError);
    expect(repository.verificationInputs).toHaveLength(0);
  });
});
