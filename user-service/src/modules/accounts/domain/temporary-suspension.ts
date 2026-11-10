/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of temporary suspension code (effectiveAccountStatus).
 * Author review: Validated effectiveAccountStatus value handling and returned results in user-service/temporary-suspension.ts; edited naming and formatting for readability.
 */

import { AccountStatus } from './account-status.js';

export function effectiveAccountStatus(
  status: AccountStatus,
  suspendedUntil: Date | null | undefined,
  now: Date,
): AccountStatus {
  return status === AccountStatus.Active &&
    suspendedUntil &&
    suspendedUntil > now
    ? AccountStatus.Suspended
    : status;
}
