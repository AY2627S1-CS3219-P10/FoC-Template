import { AccountValidationError } from './account-validation.error.js';

export const PASSWORD_MINIMUM_LENGTH = 8;

export function assertPasswordMeetsPolicy(password: string): void {
  if (password.length < PASSWORD_MINIMUM_LENGTH) {
    throw new AccountValidationError(
      'password',
      'PASSWORD_TOO_SHORT',
      `Password must contain at least ${PASSWORD_MINIMUM_LENGTH} characters.`,
    );
  }

  if (!/[A-Z]/.test(password)) {
    throw new AccountValidationError(
      'password',
      'PASSWORD_MISSING_UPPERCASE',
      'Password must contain at least one uppercase letter.',
    );
  }

  if (!/[a-z]/.test(password)) {
    throw new AccountValidationError(
      'password',
      'PASSWORD_MISSING_LOWERCASE',
      'Password must contain at least one lowercase letter.',
    );
  }

  if (!/[^A-Za-z0-9\s]/.test(password)) {
    throw new AccountValidationError(
      'password',
      'PASSWORD_MISSING_SPECIAL_CHARACTER',
      'Password must contain at least one special character.',
    );
  }
}
