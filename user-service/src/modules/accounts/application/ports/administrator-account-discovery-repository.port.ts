import type { AccountStatus } from '../../domain/account-status.js';

export interface AdministratorAccountSummary {
  email: string;
  id: string;
  isAdmin: boolean;
  status: AccountStatus;
  username: string;
}

export interface FindAdministratorAccountsInput {
  limit: number;
  search?: string;
}

export interface AdministratorAccountDiscoveryRepositoryPort {
  findAccounts(
    input: FindAdministratorAccountsInput,
  ): Promise<AdministratorAccountSummary[]>;
}
