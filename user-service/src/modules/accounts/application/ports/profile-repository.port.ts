/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of profile repository port code (AccountProfile, AccountCredentials, ChangePasswordRecord).
 * Author review: Checked existing AccountProfile, AccountCredentials parameter and return types against their callers; edited type declaration layout and member naming.
 */

import type { AccountStatus } from '../../domain/account-status.js';

export interface AccountProfile {
  suspendedUntil?: Date | null;
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
  updateUsername(
    userId: string,
    username: string,
  ): Promise<AccountProfile | null>;
}
