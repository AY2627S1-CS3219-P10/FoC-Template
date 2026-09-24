import { NusEmail } from '../../domain/nus-email.js';
import { EmailAvailabilityRateLimitError } from '../errors/email-availability-rate-limit.error.js';
import type { AccountUniquenessPort } from '../ports/account-uniqueness.port.js';
import type { EmailAvailabilityRateLimiterPort } from '../ports/email-availability-rate-limiter.port.js';

export interface CheckEmailAvailabilityInput {
  clientIdentifier: string;
  email: string;
}

export interface CheckEmailAvailabilityResult {
  available: boolean;
}

export interface CheckEmailAvailabilityDependencies {
  accountUniqueness: Pick<AccountUniquenessPort, 'isEmailTaken'>;
  rateLimiter: EmailAvailabilityRateLimiterPort;
}

export class CheckEmailAvailabilityUseCase {
  constructor(
    private readonly dependencies: CheckEmailAvailabilityDependencies,
  ) {}

  async execute(
    input: CheckEmailAvailabilityInput,
  ): Promise<CheckEmailAvailabilityResult> {
    const email = NusEmail.create(input.email);
    const rateLimit = await this.dependencies.rateLimiter.consume({
      clientIdentifier: input.clientIdentifier,
      email: email.value,
    });

    if (!rateLimit.allowed) {
      throw new EmailAvailabilityRateLimitError(rateLimit.retryAfterSeconds);
    }

    return {
      available:
        !(await this.dependencies.accountUniqueness.isEmailTaken(email)),
    };
  }
}
