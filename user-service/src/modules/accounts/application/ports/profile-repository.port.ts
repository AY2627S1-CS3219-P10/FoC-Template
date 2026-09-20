import type { AccountStatus } from '../../domain/account-status.js';

export interface AccountProfile {
  createdAt: Date;
  email: string;
  emailVerifiedAt: Date | null;
  id: string;
  isAdmin: boolean;
  phoneNumber: string;
  status: AccountStatus;
  updatedAt: Date;
  username: string;
}

export interface AccountCredentials {
  id: string;
  passwordHash: string;
}

export interface ChangePasswordRecord {
  changedAt: Date;
  passwordHash: string;
  userId: string;
}

export interface ProfileRepositoryPort {
  changePasswordAndRevokeSessions(input: ChangePasswordRecord): Promise<void>;
  findCredentialsById(userId: string): Promise<AccountCredentials | null>;
  findProfileById(userId: string): Promise<AccountProfile | null>;
  updatePhoneNumber(
    userId: string,
    phoneNumber: string,
  ): Promise<AccountProfile | null>;
}
