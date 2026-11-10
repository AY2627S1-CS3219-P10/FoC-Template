/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of verification email rate limit error code (VerificationEmailRateLimitError).
 * Author review: Checked VerificationEmailRateLimitError error messages and codes VERIFICATION_EMAIL_RESEND_RATE_LIMITED; standardized exception naming and formatting.
 */

export class VerificationEmailRateLimitError extends Error {
  readonly code = 'VERIFICATION_EMAIL_RESEND_RATE_LIMITED';
  readonly field = 'email';

  constructor(public readonly retryAfterSeconds: number) {
    super('Please wait before requesting another verification email.');
    this.name = 'VerificationEmailRateLimitError';
  }
}
