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
