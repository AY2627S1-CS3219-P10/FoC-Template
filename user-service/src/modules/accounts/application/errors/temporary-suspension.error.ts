export type TemporarySuspensionErrorCode =
  | 'ACCOUNT_NOT_FOUND'
  | 'ADMINISTRATOR_PRIVILEGES_REQUIRED'
  | 'LAST_ADMINISTRATOR_REQUIRED'
  | 'SELF_SUSPENSION_FORBIDDEN'
  | 'SUSPENSION_EXPIRY_INVALID';

export class TemporarySuspensionError extends Error {
  constructor(
    public readonly code: TemporarySuspensionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TemporarySuspensionError';
  }
}
