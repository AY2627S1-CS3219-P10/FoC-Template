/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of email availability rate limit error code (EmailAvailabilityRateLimitError).
 * Author review: Checked EmailAvailabilityRateLimitError error messages and codes EMAIL_AVAILABILITY_RATE_LIMITED; standardized exception naming and formatting.
 */

export class EmailAvailabilityRateLimitError extends Error {
  readonly code = 'EMAIL_AVAILABILITY_RATE_LIMITED';
  readonly field = 'email';

  constructor(public readonly retryAfterSeconds: number) {
    super('Too many email availability checks. Please try again later.');
    this.name = 'EmailAvailabilityRateLimitError';
  }
}
