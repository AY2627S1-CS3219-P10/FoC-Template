export type AuthenticationErrorCode =
  | 'ACCOUNT_NOT_ACTIVE'
  | 'INVALID_CREDENTIALS'
  | 'REFRESH_TOKEN_INVALID_OR_EXPIRED';

export class AuthenticationError extends Error {
  constructor(
    public readonly code: AuthenticationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AuthenticationError';
  }
}
