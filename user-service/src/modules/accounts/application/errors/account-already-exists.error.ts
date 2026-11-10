/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of account already exists error code (UniqueAccountField, AccountAlreadyExistsError).
 * Author review: Checked UniqueAccountField, AccountAlreadyExistsError error messages and codes EMAIL_ALREADY_REGISTERED, PHONE_NUMBER_ALREADY_REGISTERED, USERNAME_ALREADY_REGISTERED; standardized exception naming and formatting.
 */

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
