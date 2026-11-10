/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of password policy code (PASSWORD_MINIMUM_LENGTH, PASSWORD_MAXIMUM_LENGTH, assertPasswordMeetsPolicy).
 * Author review: Validated PASSWORD_MINIMUM_LENGTH, PASSWORD_MAXIMUM_LENGTH input handling, return values, and thrown errors in user-service/password-policy.ts; edited naming and formatting for readability.
 */

import { AccountValidationError } from './account-validation.error.js';

export const PASSWORD_MINIMUM_LENGTH = 8;
export const PASSWORD_MAXIMUM_LENGTH = 128;

export function assertPasswordMeetsPolicy(password: string): void {
  if (password.length > PASSWORD_MAXIMUM_LENGTH) {
    throw new AccountValidationError(
      'password',
      'PASSWORD_TOO_LONG',
      `Password must contain at most ${PASSWORD_MAXIMUM_LENGTH} characters.`,
    );
  }

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
