import type {
  AuthenticatedAccount,
  ReplacementSessionRecord,
  SessionRecord,
} from '../ports/authentication-repository.port.js';
import type { AccessTokenPort } from '../ports/access-token.port.js';
import type { ClockPort } from '../ports/clock.port.js';
import type { IdGeneratorPort } from '../ports/id-generator.port.js';
import type { RefreshTokenPort } from '../ports/refresh-token.port.js';

export const ACCESS_TOKEN_LIFETIME_SECONDS = 15 * 60;
export const REFRESH_SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export interface SessionTokenPair {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  tokenType: 'Bearer';
}

export interface PreparedSession {
  record: ReplacementSessionRecord;
  refreshToken: string;
}

export interface SessionTokenIssuerDependencies {
  accessTokens: AccessTokenPort;
  clock: ClockPort;
  idGenerator: IdGeneratorPort;
  refreshTokens: RefreshTokenPort;
}

export class SessionTokenIssuer {
  constructor(private readonly dependencies: SessionTokenIssuerDependencies) {}

  prepare(): PreparedSession {
    const now = this.dependencies.clock.now();
    const sessionId = this.dependencies.idGenerator.generate();
    const refreshToken = this.dependencies.refreshTokens.generate();
    const record: ReplacementSessionRecord = {
      createdAt: now,
      expiresAt: new Date(now.getTime() + REFRESH_SESSION_LIFETIME_MS),
      id: sessionId,
      refreshTokenHash: this.dependencies.refreshTokens.hash(refreshToken),
    };

    return { record, refreshToken };
  }

  async issueTokens(
    account: AuthenticatedAccount,
    prepared: PreparedSession,
  ): Promise<SessionTokenPair> {
    const accessToken = await this.dependencies.accessTokens.issue({
      expiresAt: new Date(
        prepared.record.createdAt.getTime() +
          ACCESS_TOKEN_LIFETIME_SECONDS * 1000,
      ),
      isAdmin: account.isAdmin,
      issuedAt: prepared.record.createdAt,
      sessionId: prepared.record.id,
      userId: account.id,
    });

    return {
      accessToken,
      expiresIn: ACCESS_TOKEN_LIFETIME_SECONDS,
      refreshToken: prepared.refreshToken,
      tokenType: 'Bearer',
    };
  }

  toSessionRecord(prepared: PreparedSession, userId: string): SessionRecord {
    return { ...prepared.record, userId };
  }
}
