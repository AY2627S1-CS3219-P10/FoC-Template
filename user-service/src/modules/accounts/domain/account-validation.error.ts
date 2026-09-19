export type AccountValidationField =
  'email' | 'password' | 'phoneNumber' | 'username';

export class AccountValidationError extends Error {
  constructor(
    public readonly field: AccountValidationField,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AccountValidationError';
  }
}
