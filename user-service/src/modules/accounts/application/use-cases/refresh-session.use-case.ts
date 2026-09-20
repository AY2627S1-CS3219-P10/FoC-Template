import { AuthenticationError } from '../errors/authentication.error.js';
import type { AuthenticationRepositoryPort } from '../ports/authentication-repository.port.js';
import type { ClockPort } from '../ports/clock.port.js';
import type { RefreshTokenPort } from '../ports/refresh-token.port.js';
import type { AuthenticationResult } from './login.use-case.js';
import type { SessionTokenIssuer } from '../services/session-token-issuer.js';

export interface RefreshSessionInput {
  refreshToken: string;
}

export interface RefreshSessionDependencies {
  clock: ClockPort;
  refreshTokens: RefreshTokenPort;
  repository: Pick<AuthenticationRepositoryPort, 'rotateSession'>;
  sessionTokenIssuer: SessionTokenIssuer;
}

export class RefreshSessionUseCase {
  constructor(private readonly dependencies: RefreshSessionDependencies) {}

  async execute(input: RefreshSessionInput): Promise<AuthenticationResult> {
    const now = this.dependencies.clock.now();
    const currentRefreshTokenHash = this.dependencies.refreshTokens.hash(
      input.refreshToken,
    );
    const prepared = this.dependencies.sessionTokenIssuer.prepare();
    const account = await this.dependencies.repository.rotateSession({
      currentRefreshTokenHash,
      now,
      replacement: prepared.record,
    });

    if (!account) {
      throw new AuthenticationError(
        'REFRESH_TOKEN_INVALID_OR_EXPIRED',
        'Refresh token is invalid or expired.',
      );
    }

    const tokens = await this.dependencies.sessionTokenIssuer.issueTokens(
      account,
      prepared,
    );

    return {
      ...tokens,
      user: {
        id: account.id,
        isAdmin: account.isAdmin,
        username: account.username,
      },
    };
  }
}
