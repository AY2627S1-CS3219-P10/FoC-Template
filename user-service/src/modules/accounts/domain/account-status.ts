/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of account status code (AccountStatus, NEW_ACCOUNT_DEFAULTS).
 * Author review: Validated AccountStatus, NEW_ACCOUNT_DEFAULTS existing type members and constant values in user-service/account-status.ts; edited naming and formatting for readability.
 */

export enum AccountStatus {
  PendingVerification = 'PENDING_VERIFICATION',
  Active = 'ACTIVE',
  Suspended = 'SUSPENDED',
  Banned = 'BANNED',
}

export const NEW_ACCOUNT_DEFAULTS = Object.freeze({
  isAdmin: false,
  status: AccountStatus.PendingVerification,
});
