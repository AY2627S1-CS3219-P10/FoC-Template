/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of find administrator accounts code (ADMINISTRATOR_ACCOUNT_RESULT_LIMIT, FindAdministratorAccountsInput, FindAdministratorAccountsUseCase).
 * Author review: Validated ADMINISTRATOR_ACCOUNT_RESULT_LIMIT, FindAdministratorAccountsInput input handling, dependency calls, and success/error return paths; clarified local naming and control-flow formatting.
 */

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
