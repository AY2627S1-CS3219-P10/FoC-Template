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
