/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of email verification error code (EmailVerificationErrorCode, EmailVerificationError).
 * Author review: Checked EmailVerificationErrorCode, EmailVerificationError error messages and codes ACCOUNT_NOT_PENDING_VERIFICATION, VERIFICATION_CODE_INVALID_FORMAT, VERIFICATION_CODE_INVALID_OR_EXPIRED; standardized exception naming and formatting.
 */

export type EmailVerificationErrorCode =
  | 'ACCOUNT_NOT_PENDING_VERIFICATION'
  | 'VERIFICATION_CODE_INVALID_FORMAT'
  | 'VERIFICATION_CODE_INVALID_OR_EXPIRED';

export class EmailVerificationError extends Error {
  readonly field = 'code';

  constructor(
    public readonly code: EmailVerificationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'EmailVerificationError';
  }
}
