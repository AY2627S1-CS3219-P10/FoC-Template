/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of administrator seed repository port code (AdministratorSeedRecord, AdministratorSeedResult, AdministratorSeedRepositoryPort).
 * Author review: Checked existing AdministratorSeedRecord, AdministratorSeedResult parameter and return types against their callers; edited type declaration layout and member naming.
 */

import type { AccountStatus } from '../../domain/account-status.js';

export interface AdministratorSeedRecord {
  email: string;
  emailVerifiedAt: Date;
  id: string;
  isAdmin: true;
  passwordHash: string;
  phoneNumber: string;
  status: AccountStatus.Active;
  username: string;
}

export interface AdministratorSeedResult {
  createdCount: number;
  existingCount: number;
}

export interface AdministratorSeedRepositoryPort {
  seedAdministrators(
    records: AdministratorSeedRecord[],
  ): Promise<AdministratorSeedResult>;
}
