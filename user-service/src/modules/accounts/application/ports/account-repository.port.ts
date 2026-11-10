/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of account repository port code (NewAccountRecord, AccountRepositoryPort).
 * Author review: Checked existing NewAccountRecord, AccountRepositoryPort parameter and return types against their callers; edited type declaration layout and member naming.
 */

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
