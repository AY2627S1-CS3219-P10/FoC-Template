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
