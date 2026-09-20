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
