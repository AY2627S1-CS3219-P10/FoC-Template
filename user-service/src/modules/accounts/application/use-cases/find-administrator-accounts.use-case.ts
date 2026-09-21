import type {
  AdministratorAccountDiscoveryRepositoryPort,
  AdministratorAccountSummary,
} from '../ports/administrator-account-discovery-repository.port.js';

export const ADMINISTRATOR_ACCOUNT_RESULT_LIMIT = 50;

export interface FindAdministratorAccountsInput {
  search?: string;
}

export class FindAdministratorAccountsUseCase {
  constructor(
    private readonly repository: AdministratorAccountDiscoveryRepositoryPort,
  ) {}

  execute(
    input: FindAdministratorAccountsInput,
  ): Promise<AdministratorAccountSummary[]> {
    const search = input.search?.trim();

    return this.repository.findAccounts({
      limit: ADMINISTRATOR_ACCOUNT_RESULT_LIMIT,
      ...(search ? { search } : {}),
    });
  }
}
