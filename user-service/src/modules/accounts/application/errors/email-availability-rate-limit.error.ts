export class EmailAvailabilityRateLimitError extends Error {
  readonly code = 'EMAIL_AVAILABILITY_RATE_LIMITED';
  readonly field = 'email';

  constructor(public readonly retryAfterSeconds: number) {
    super('Too many email availability checks. Please try again later.');
    this.name = 'EmailAvailabilityRateLimitError';
  }
}
