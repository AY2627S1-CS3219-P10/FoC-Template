/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of email verification code code (EmailVerificationCode).
 * Author review: Validated EmailVerificationCode input handling, return values, and thrown errors in user-service/email-verification-code.ts; edited naming and formatting for readability.
 */

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
