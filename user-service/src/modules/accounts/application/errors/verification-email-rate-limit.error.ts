export class VerificationEmailRateLimitError extends Error {
  readonly code = 'VERIFICATION_EMAIL_RESEND_RATE_LIMITED';
  readonly field = 'email';

  constructor(public readonly retryAfterSeconds: number) {
    super('Please wait before requesting another verification email.');
    this.name = 'VerificationEmailRateLimitError';
  }
}
