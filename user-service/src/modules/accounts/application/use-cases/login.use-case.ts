import { AccountStatus } from '../../domain/account-status.js';
import { NusEmail } from '../../domain/nus-email.js';
import { AuthenticationError } from '../errors/authentication.error.js';
import type { AuthenticationRepositoryPort } from '../ports/authentication-repository.port.js';
import type { PasswordVerifierPort } from '../ports/password-verifier.port.js';
import type { SessionTokenPair } from '../services/session-token-issuer.js';
import type { SessionTokenIssuer } from '../services/session-token-issuer.js';

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthenticationResult extends SessionTokenPair {
  user: {
    id: string;
    isAdmin: boolean;
    username: string;
  };
}

export interface LoginDependencies {
  passwordVerifier: PasswordVerifierPort;
  repository: Pick<
    AuthenticationRepositoryPort,
    'createSession' | 'findAccountByEmail'
  >;
  sessionTokenIssuer: SessionTokenIssuer;
}

export class LoginUseCase {
  constructor(private readonly dependencies: LoginDependencies) {}

  async execute(input: LoginInput): Promise<AuthenticationResult> {
    const email = NusEmail.create(input.email).value;
    const account =
      await this.dependencies.repository.findAccountByEmail(email);
    const passwordMatches = await this.dependencies.passwordVerifier.verify(
      input.password,
      account?.passwordHash ?? null,
    );

    if (!account || !passwordMatches) {
      throw new AuthenticationError(
        'INVALID_CREDENTIALS',
        'Email address or password is incorrect.',
      );
    }

    if (account.status !== AccountStatus.Active) {
      throw new AuthenticationError(
        'ACCOUNT_NOT_ACTIVE',
        'Account is not available for login.',
      );
    }

    const prepared = this.dependencies.sessionTokenIssuer.prepare();
    const tokens = await this.dependencies.sessionTokenIssuer.issueTokens(
      account,
      prepared,
    );
    await this.dependencies.repository.createSession(
      this.dependencies.sessionTokenIssuer.toSessionRecord(
        prepared,
        account.id,
      ),
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
