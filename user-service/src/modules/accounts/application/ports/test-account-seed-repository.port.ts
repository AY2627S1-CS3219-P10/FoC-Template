/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of existing test-account seed method declarations.
 * Author review: Checked existing TestAccountSeedRecord, TestAccountSeedResult parameter and result types against their callers; standardized type-member formatting.
 */

import type { AccountStatus } from '../../domain/account-status.js';

export interface TestAccountSeedRecord {
  email: string;
  emailVerifiedAt: Date;
  eventId: string;
  id: string;
  isAdmin: false;
  passwordHash: string;
  phoneNumber: string;
  status: AccountStatus.Active;
  username: string;
}

export interface TestAccountSeedResult {
  createdCount: number;
  existingCount: number;
}

export interface TestAccountSeedRepositoryPort {
  seedTestAccounts(
    records: TestAccountSeedRecord[],
  ): Promise<TestAccountSeedResult>;
}
