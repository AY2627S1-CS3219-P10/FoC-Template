import { AccountValidationError } from './account-validation.error.js';

const ALPHANUMERIC_PATTERN = /^[A-Za-z0-9]+$/;
export const USERNAME_MAXIMUM_LENGTH = 50;

export class Username {
  private constructor(public readonly value: string) {}

  static create(value: string): Username {
    if (value.length === 0) {
      throw new AccountValidationError(
        'username',
        'USERNAME_REQUIRED',
        'Username is required.',
      );
    }

    if (!ALPHANUMERIC_PATTERN.test(value)) {
      throw new AccountValidationError(
        'username',
        'USERNAME_INVALID_FORMAT',
        'Username must contain only letters and numbers.',
      );
    }

    if (value.length > USERNAME_MAXIMUM_LENGTH) {
      throw new AccountValidationError(
        'username',
        'USERNAME_TOO_LONG',
        `Username must contain at most ${USERNAME_MAXIMUM_LENGTH} characters.`,
      );
    }

    return new Username(value);
  }
}
