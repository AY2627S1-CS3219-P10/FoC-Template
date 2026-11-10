/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of authentication repository port code (AuthenticatedAccount, AuthenticationAccount, SessionRecord).
 * Author review: Checked existing AuthenticatedAccount, AuthenticationAccount parameter and return types against their callers; edited type declaration layout and member naming.
 */

import type { AccountStatus } from '../../domain/account-status.js';

export interface AuthenticatedAccount {
  id: string;
  isAdmin: boolean;
  status: AccountStatus;
  username: string;
}

export interface AuthenticationAccount extends AuthenticatedAccount {
  suspendedUntil?: Date | null;
  email: string;
  passwordHash: string;
}

export interface SessionRecord {
  createdAt: Date;
  expiresAt: Date;
  id: string;
  refreshTokenHash: string;
  userId: string;
}

export type ReplacementSessionRecord = Omit<SessionRecord, 'userId'>;

export interface RotateSessionInput {
  currentRefreshTokenHash: string;
  now: Date;
  replacement: ReplacementSessionRecord;
}

export interface RevokeSessionInput {
  now: Date;
  refreshTokenHash: string;
}

export interface ActiveSessionInput {
  now: Date;
  sessionId: string;
  userId: string;
}

export interface AuthenticationRepositoryPort {
  createSession(session: SessionRecord): Promise<void>;
  findActiveSessionAccount(
    input: ActiveSessionInput,
  ): Promise<AuthenticatedAccount | null>;
  findAccountByEmail(email: string): Promise<AuthenticationAccount | null>;
  revokeSession(input: RevokeSessionInput): Promise<void>;
  rotateSession(
    input: RotateSessionInput,
  ): Promise<AuthenticatedAccount | null>;
}
