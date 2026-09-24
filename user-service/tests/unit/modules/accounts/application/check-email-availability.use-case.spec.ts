import type { AccountUniquenessPort } from '../../../../../src/modules/accounts/application/ports/account-uniqueness.port.js';
import type {
  EmailAvailabilityRateLimitDecision,
  EmailAvailabilityRateLimitInput,
  EmailAvailabilityRateLimiterPort,
} from '../../../../../src/modules/accounts/application/ports/email-availability-rate-limiter.port.js';
import { CheckEmailAvailabilityUseCase } from '../../../../../src/modules/accounts/application/use-cases/check-email-availability.use-case.js';
import type { NusEmail } from '../../../../../src/modules/accounts/domain/nus-email.js';

class StubUniqueness implements AccountUniquenessPort {
  checkedEmails: string[] = [];
  emailTaken = false;

  isEmailTaken(email: NusEmail): Promise<boolean> {
    this.checkedEmails.push(email.value);
    return Promise.resolve(this.emailTaken);
  }

  isPhoneNumberTaken(): Promise<boolean> {
    return Promise.resolve(false);
  }

  isUsernameTaken(): Promise<boolean> {
    return Promise.resolve(false);
  }
}

class StubRateLimiter implements EmailAvailabilityRateLimiterPort {
  decision: EmailAvailabilityRateLimitDecision = {
    allowed: true,
    retryAfterSeconds: 0,
  };
  inputs: EmailAvailabilityRateLimitInput[] = [];

  consume(
    input: EmailAvailabilityRateLimitInput,
  ): Promise<EmailAvailabilityRateLimitDecision> {
    this.inputs.push(input);
    return Promise.resolve(this.decision);
  }
}

describe('CheckEmailAvailabilityUseCase', () => {
  it.each([
    [false, true],
    [true, false],
  ])(
    'returns availability without account details',
    async (taken, available) => {
      const accountUniqueness = new StubUniqueness();
      const rateLimiter = new StubRateLimiter();
      accountUniqueness.emailTaken = taken;
      const useCase = new CheckEmailAvailabilityUseCase({
        accountUniqueness,
        rateLimiter,
      });

      await expect(
        useCase.execute({
          clientIdentifier: '127.0.0.1',
          email: ' Student@U.NUS.EDU ',
        }),
      ).resolves.toEqual({ available });
      expect(rateLimiter.inputs).toEqual([
        { clientIdentifier: '127.0.0.1', email: 'student@u.nus.edu' },
      ]);
      expect(accountUniqueness.checkedEmails).toEqual(['student@u.nus.edu']);
    },
  );

  it('rejects a non-NUS email before rate limiting or lookup', async () => {
    const accountUniqueness = new StubUniqueness();
    const rateLimiter = new StubRateLimiter();
    const useCase = new CheckEmailAvailabilityUseCase({
      accountUniqueness,
      rateLimiter,
    });

    await expect(
      useCase.execute({
        clientIdentifier: '127.0.0.1',
        email: 'student@example.com',
      }),
    ).rejects.toMatchObject({ code: 'EMAIL_INVALID_NUS_ADDRESS' });
    expect(rateLimiter.inputs).toHaveLength(0);
    expect(accountUniqueness.checkedEmails).toHaveLength(0);
  });

  it('does not query PostgreSQL after the rate limit is reached', async () => {
    const accountUniqueness = new StubUniqueness();
    const rateLimiter = new StubRateLimiter();
    rateLimiter.decision = { allowed: false, retryAfterSeconds: 42 };
    const useCase = new CheckEmailAvailabilityUseCase({
      accountUniqueness,
      rateLimiter,
    });

    await expect(
      useCase.execute({
        clientIdentifier: '127.0.0.1',
        email: 'student@u.nus.edu',
      }),
    ).rejects.toMatchObject({
      code: 'EMAIL_AVAILABILITY_RATE_LIMITED',
      retryAfterSeconds: 42,
    });
    expect(accountUniqueness.checkedEmails).toHaveLength(0);
  });
});
