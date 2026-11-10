/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of administrator privilege error code (AdministratorPrivilegeErrorCode, AdministratorPrivilegeError).
 * Author review: Checked AdministratorPrivilegeErrorCode, AdministratorPrivilegeError error messages and codes ACCOUNT_NOT_FOUND, ADMINISTRATOR_PRIVILEGES_REQUIRED, ADMINISTRATOR_SELF_CHANGE_FORBIDDEN; standardized exception naming and formatting.
 */

export type AdministratorPrivilegeErrorCode =
  | 'ACCOUNT_NOT_FOUND'
  | 'ADMINISTRATOR_PRIVILEGES_REQUIRED'
  | 'ADMINISTRATOR_SELF_CHANGE_FORBIDDEN'
  | 'LAST_ADMINISTRATOR_REQUIRED';

export class AdministratorPrivilegeError extends Error {
  constructor(
    public readonly code: AdministratorPrivilegeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AdministratorPrivilegeError';
  }
}
