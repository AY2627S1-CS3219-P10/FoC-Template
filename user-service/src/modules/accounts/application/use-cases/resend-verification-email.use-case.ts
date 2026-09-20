import { NusEmail } from '../../domain/nus-email.js';
import { EmailVerificationError } from '../errors/email-verification.error.js';
import { VerificationEmailRateLimitError } from '../errors/verification-email-rate-limit.error.js';
import type { EmailVerificationRepositoryPort } from '../ports/email-verification-repository.port.js';
import type { VerificationEmailDeliveryPort } from '../ports/verification-email-delivery.port.js';
import type { VerificationEmailResendRateLimiterPort } from '../ports/verification-email-resend-rate-limiter.port.js';
import type { IssueEmailVerificationCodeUseCase } from './issue-email-verification-code.use-case.js';

export interface ResendVerificationEmailDependencies {
  emailDelivery: VerificationEmailDeliveryPort;
  issueEmailVerificationCode: Pick<
    IssueEmailVerificationCodeUseCase,
    'execute'
  >;
  rateLimiter: VerificationEmailResendRateLimiterPort;
  repository: Pick<
    EmailVerificationRepositoryPort,
    'findPendingAccountByEmail'
  >;
}

export interface ResendVerificationEmailInput {
  email: string;
}

export class ResendVerificationEmailUseCase {
  constructor(
    private readonly dependencies: ResendVerificationEmailDependencies,
  ) {}

  async execute(input: ResendVerificationEmailInput): Promise<void> {
    const email = NusEmail.create(input.email).value;
    const rateLimit = await this.dependencies.rateLimiter.consume(email);

    if (!rateLimit.allowed) {
      throw new VerificationEmailRateLimitError(rateLimit.retryAfterSeconds);
    }

    const account =
      await this.dependencies.repository.findPendingAccountByEmail(email);

    if (!account) {
      return;
    }

    try {
      const verification =
        await this.dependencies.issueEmailVerificationCode.execute(account.id);

      await this.dependencies.emailDelivery.enqueue({
        code: verification.code,
        expiresAt: verification.expiresAt,
        recipientEmail: account.email,
        verificationId: verification.verificationId,
      });
    } catch (error: unknown) {
      if (
        error instanceof EmailVerificationError &&
        error.code === 'ACCOUNT_NOT_PENDING_VERIFICATION'
      ) {
        return;
      }

      throw error;
    }
  }
}
