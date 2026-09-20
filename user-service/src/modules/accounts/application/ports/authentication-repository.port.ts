import type { AccountStatus } from '../../domain/account-status.js';

export interface AuthenticatedAccount {
  id: string;
  isAdmin: boolean;
  status: AccountStatus;
  username: string;
}

export interface AuthenticationAccount extends AuthenticatedAccount {
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

export interface AuthenticationRepositoryPort {
  createSession(session: SessionRecord): Promise<void>;
  findAccountByEmail(email: string): Promise<AuthenticationAccount | null>;
  revokeSession(input: RevokeSessionInput): Promise<void>;
  rotateSession(
    input: RotateSessionInput,
  ): Promise<AuthenticatedAccount | null>;
}
