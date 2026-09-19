export type UniqueAccountField = 'email' | 'phoneNumber' | 'username';

const ERROR_CODES: Record<UniqueAccountField, string> = {
  email: 'EMAIL_ALREADY_REGISTERED',
  phoneNumber: 'PHONE_NUMBER_ALREADY_REGISTERED',
  username: 'USERNAME_ALREADY_REGISTERED',
};

export class AccountAlreadyExistsError extends Error {
  public readonly code: string;

  constructor(public readonly field: UniqueAccountField) {
    super(`An account with this ${field} already exists.`);
    this.name = 'AccountAlreadyExistsError';
    this.code = ERROR_CODES[field];
  }
}
