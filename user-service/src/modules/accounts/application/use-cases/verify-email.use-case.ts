import { EmailVerificationCode } from '../../domain/email-verification-code.js';
import { NusEmail } from '../../domain/nus-email.js';
import { EmailVerificationError } from '../errors/email-verification.error.js';
import type { ClockPort } from '../ports/clock.port.js';
import type { EmailVerificationRepositoryPort } from '../ports/email-verification-repository.port.js';
import type { VerificationCodeHasherPort } from '../ports/verification-code-hasher.port.js';

export const MAXIMUM_EMAIL_VERIFICATION_ATTEMPTS = 5;

export interface VerifyEmailDependencies {
  clock: ClockPort;
  codeHasher: VerificationCodeHasherPort;
  repository: EmailVerificationRepositoryPort;
}

export interface VerifyEmailInput {
  code: string;
  email: string;
}

export class VerifyEmailUseCase {
  constructor(private readonly dependencies: VerifyEmailDependencies) {}

  async execute(input: VerifyEmailInput): Promise<void> {
    const email = NusEmail.create(input.email);
    const code = EmailVerificationCode.create(input.code);
    const verified = await this.dependencies.repository.verifyAndActivate({
      candidateCodeHash: this.dependencies.codeHasher.hash(code.value),
      email: email.value,
      maximumAttempts: MAXIMUM_EMAIL_VERIFICATION_ATTEMPTS,
      now: this.dependencies.clock.now(),
    });

    if (!verified) {
      throw new EmailVerificationError(
        'VERIFICATION_CODE_INVALID_OR_EXPIRED',
        'Verification code is invalid or expired.',
      );
    }
  }
}
