import { EmailVerificationError } from '../../../../../src/modules/accounts/application/errors/email-verification.error.js';
import type { VerificationEmailMessage } from '../../../../../src/modules/accounts/application/ports/verification-email-delivery.port.js';
import type { RateLimitDecision } from '../../../../../src/modules/accounts/application/ports/verification-email-resend-rate-limiter.port.js';
import {
  type ResendVerificationEmailDependencies,
  ResendVerificationEmailUseCase,
} from '../../../../../src/modules/accounts/application/use-cases/resend-verification-email.use-case.js';

const ACCOUNT = {
  email: 'student@u.nus.edu',
  id: '4a84f480-b1cb-4b81-b632-8bb49034b9e7',
};
const VERIFICATION = {
  code: '042731',
  expiresAt: new Date('2026-09-20T02:10:00.000Z'),
  verificationId: 'a23394c1-c131-4b77-bf0d-c39bc11bf81e',
};

interface StubOptions {
  account?: typeof ACCOUNT | null;
  issueError?: Error;
  rateLimit?: RateLimitDecision;
}

interface RecordedCalls {
  consumedIdentifiers: string[];
  issuedForUserIds: string[];
  lookedUpEmails: string[];
  queuedMessages: VerificationEmailMessage[];
}

function createDependencies(options: StubOptions = {}): {
  dependencies: ResendVerificationEmailDependencies;
  recorded: RecordedCalls;
} {
  const consumedIdentifiers: string[] = [];
  const lookedUpEmails: string[] = [];
  const issuedForUserIds: string[] = [];
  const queuedMessages: VerificationEmailMessage[] = [];

  return {
    dependencies: {
      emailDelivery: {
        enqueue: (message: VerificationEmailMessage) => {
          queuedMessages.push(message);
          return Promise.resolve();
        },
      },
      issueEmailVerificationCode: {
        execute: (userId: string) => {
          issuedForUserIds.push(userId);

          return options.issueError
            ? Promise.reject(options.issueError)
            : Promise.resolve(VERIFICATION);
        },
      },
      rateLimiter: {
        consume: (identifier: string) => {
          consumedIdentifiers.push(identifier);
          return Promise.resolve(
            options.rateLimit ?? { allowed: true, retryAfterSeconds: 0 },
          );
        },
      },
      repository: {
        findPendingAccountByEmail: (email: string) => {
          lookedUpEmails.push(email);
          return Promise.resolve(
            options.account === undefined ? ACCOUNT : options.account,
          );
        },
      },
    },
    recorded: {
      consumedIdentifiers,
      issuedForUserIds,
      lookedUpEmails,
      queuedMessages,
    },
  };
}

describe('ResendVerificationEmailUseCase', () => {
  it('normalizes the email, issues a replacement code, and queues it', async () => {
    const { dependencies, recorded } = createDependencies();
    const useCase = new ResendVerificationEmailUseCase(dependencies);

    await expect(
      useCase.execute({ email: ' Student@U.NUS.EDU ' }),
    ).resolves.toBeUndefined();
    expect(recorded.consumedIdentifiers).toEqual([ACCOUNT.email]);
    expect(recorded.lookedUpEmails).toEqual([ACCOUNT.email]);
    expect(recorded.issuedForUserIds).toEqual([ACCOUNT.id]);
    expect(recorded.queuedMessages).toEqual([
      {
        ...VERIFICATION,
        recipientEmail: ACCOUNT.email,
      },
    ]);
  });

  it('returns the same success outcome when no pending account exists', async () => {
    const { dependencies, recorded } = createDependencies({ account: null });
    const useCase = new ResendVerificationEmailUseCase(dependencies);

    await expect(
      useCase.execute({ email: ACCOUNT.email }),
    ).resolves.toBeUndefined();
    expect(recorded.issuedForUserIds).toHaveLength(0);
    expect(recorded.queuedMessages).toHaveLength(0);
  });

  it('rejects a request before account lookup when rate limited', async () => {
    const { dependencies, recorded } = createDependencies({
      rateLimit: { allowed: false, retryAfterSeconds: 37 },
    });
    const useCase = new ResendVerificationEmailUseCase(dependencies);

    await expect(
      useCase.execute({ email: ACCOUNT.email }),
    ).rejects.toMatchObject({
      code: 'VERIFICATION_EMAIL_RESEND_RATE_LIMITED',
      retryAfterSeconds: 37,
    });
    expect(recorded.lookedUpEmails).toHaveLength(0);
    expect(recorded.issuedForUserIds).toHaveLength(0);
  });

  it('keeps the response generic if the account becomes ineligible', async () => {
    const { dependencies, recorded } = createDependencies({
      issueError: new EmailVerificationError(
        'ACCOUNT_NOT_PENDING_VERIFICATION',
        'Account is not awaiting email verification.',
      ),
    });
    const useCase = new ResendVerificationEmailUseCase(dependencies);

    await expect(
      useCase.execute({ email: ACCOUNT.email }),
    ).resolves.toBeUndefined();
    expect(recorded.queuedMessages).toHaveLength(0);
  });
});
