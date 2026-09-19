import type { AccountStatus } from '../../domain/account-status.js';

export interface NewAccountRecord {
  email: string;
  id: string;
  isAdmin: boolean;
  passwordHash: string;
  phoneNumber: string;
  status: AccountStatus;
  username: string;
}

export interface AccountRepositoryPort {
  create(account: NewAccountRecord): Promise<void>;
}
