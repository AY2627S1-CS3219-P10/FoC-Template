export type AuthenticationErrorCode =
  | 'ACCOUNT_NOT_ACTIVE'
  | 'ACCESS_TOKEN_INVALID_OR_EXPIRED'
  | 'CURRENT_PASSWORD_INCORRECT'
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
