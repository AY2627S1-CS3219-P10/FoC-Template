/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of account validation error code (AccountValidationField, AccountValidationError).
 * Author review: Checked AccountValidationField, AccountValidationError error messages and exposed properties; standardized exception naming and formatting.
 */

export type AccountValidationField =
  'email' | 'password' | 'phoneNumber' | 'username' | 'verificationCode';

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
