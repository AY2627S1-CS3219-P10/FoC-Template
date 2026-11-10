/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of administrator account discovery repository port code (AdministratorAccountSummary, FindAdministratorAccountsInput, AdministratorAccountDiscoveryRepositoryPort).
 * Author review: Checked existing AdministratorAccountSummary, FindAdministratorAccountsInput parameter and return types against their callers; edited type declaration layout and member naming.
 */

import type { AccountStatus } from '../../domain/account-status.js';

export interface AdministratorAccountSummary {
  suspendedUntil?: Date | null;
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
