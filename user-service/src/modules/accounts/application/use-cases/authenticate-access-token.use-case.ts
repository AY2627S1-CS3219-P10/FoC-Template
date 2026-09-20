import { AuthenticationError } from '../errors/authentication.error.js';
import type { AccessTokenPort } from '../ports/access-token.port.js';
import type {
  AuthenticatedAccount,
  AuthenticationRepositoryPort,
} from '../ports/authentication-repository.port.js';
import type { ClockPort } from '../ports/clock.port.js';

export interface AuthenticateAccessTokenDependencies {
  accessTokens: AccessTokenPort;
  clock: ClockPort;
  repository: Pick<AuthenticationRepositoryPort, 'findActiveSessionAccount'>;
}

export class AuthenticateAccessTokenUseCase {
  constructor(
    private readonly dependencies: AuthenticateAccessTokenDependencies,
  ) {}

  async execute(accessToken: string): Promise<AuthenticatedAccount> {
    let claims;

    try {
      claims = await this.dependencies.accessTokens.verify(accessToken);
    } catch {
      throw this.invalidAccessToken();
    }

    const account = await this.dependencies.repository.findActiveSessionAccount(
      {
        now: this.dependencies.clock.now(),
        sessionId: claims.sessionId,
        userId: claims.userId,
      },
    );

    if (!account) {
      throw this.invalidAccessToken();
    }

    return account;
  }

  private invalidAccessToken(): AuthenticationError {
    return new AuthenticationError(
      'ACCESS_TOKEN_INVALID_OR_EXPIRED',
      'Access token is invalid or expired.',
    );
  }
}
