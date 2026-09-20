import { AccountValidationError } from './account-validation.error.js';

const SIX_DIGIT_CODE_PATTERN = /^[0-9]{6}$/;

export class EmailVerificationCode {
  private constructor(public readonly value: string) {}

  static create(value: string): EmailVerificationCode {
    if (!SIX_DIGIT_CODE_PATTERN.test(value)) {
      throw new AccountValidationError(
        'verificationCode',
        'VERIFICATION_CODE_INVALID_FORMAT',
        'Verification code must contain exactly six digits.',
      );
    }

    return new EmailVerificationCode(value);
  }
}
