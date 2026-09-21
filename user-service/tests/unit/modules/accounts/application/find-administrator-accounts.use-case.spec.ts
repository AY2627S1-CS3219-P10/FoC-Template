import type {
  AdministratorAccountDiscoveryRepositoryPort,
  AdministratorAccountSummary,
  FindAdministratorAccountsInput as RepositoryInput,
} from '../../../../../src/modules/accounts/application/ports/administrator-account-discovery-repository.port.js';
import {
  ADMINISTRATOR_ACCOUNT_RESULT_LIMIT,
  FindAdministratorAccountsUseCase,
} from '../../../../../src/modules/accounts/application/use-cases/find-administrator-accounts.use-case.js';
import { AccountStatus } from '../../../../../src/modules/accounts/domain/account-status.js';

const ACCOUNT: AdministratorAccountSummary = {
  email: 'student@u.nus.edu',
  id: '4a84f480-b1cb-4b81-b632-8bb49034b9e7',
  isAdmin: false,
  status: AccountStatus.Active,
  username: 'StudentOne',
};

class StubRepository implements AdministratorAccountDiscoveryRepositoryPort {
  inputs: RepositoryInput[] = [];

  findAccounts(input: RepositoryInput): Promise<AdministratorAccountSummary[]> {
    this.inputs.push(input);
    return Promise.resolve([ACCOUNT]);
  }
}

describe('FindAdministratorAccountsUseCase', () => {
  it('trims a search and applies the bounded result limit', async () => {
    const repository = new StubRepository();
    const useCase = new FindAdministratorAccountsUseCase(repository);

    await expect(useCase.execute({ search: ' student ' })).resolves.toEqual([
      ACCOUNT,
    ]);
    expect(repository.inputs).toEqual([
      { limit: ADMINISTRATOR_ACCOUNT_RESULT_LIMIT, search: 'student' },
    ]);
  });

  it('lists accounts without a filter for a blank search', async () => {
    const repository = new StubRepository();
    const useCase = new FindAdministratorAccountsUseCase(repository);

    await useCase.execute({ search: '   ' });

    expect(repository.inputs).toEqual([
      { limit: ADMINISTRATOR_ACCOUNT_RESULT_LIMIT },
    ]);
  });
});
