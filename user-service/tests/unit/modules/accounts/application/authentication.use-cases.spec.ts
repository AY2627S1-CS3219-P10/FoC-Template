import type {
  AuthenticatedAccount,
  AuthenticationAccount,
  AuthenticationRepositoryPort,
  RevokeSessionInput,
  RotateSessionInput,
  SessionRecord,
} from '../../../../../src/modules/accounts/application/ports/authentication-repository.port.js';
import type {
  AccessTokenClaims,
  AccessTokenPort,
  IssueAccessTokenInput,
} from '../../../../../src/modules/accounts/application/ports/access-token.port.js';
import type { ClockPort } from '../../../../../src/modules/accounts/application/ports/clock.port.js';
import type { IdGeneratorPort } from '../../../../../src/modules/accounts/application/ports/id-generator.port.js';
import type { PasswordVerifierPort } from '../../../../../src/modules/accounts/application/ports/password-verifier.port.js';
import type { RefreshTokenPort } from '../../../../../src/modules/accounts/application/ports/refresh-token.port.js';
import { ACCESS_TOKEN_LIFETIME_SECONDS } from '../../../../../src/modules/accounts/application/contracts/access-token.contract.js';
import {
  REFRESH_SESSION_LIFETIME_MS,
  SessionTokenIssuer,
} from '../../../../../src/modules/accounts/application/services/session-token-issuer.js';
import { LoginUseCase } from '../../../../../src/modules/accounts/application/use-cases/login.use-case.js';
import { LogoutUseCase } from '../../../../../src/modules/accounts/application/use-cases/logout.use-case.js';
import { RefreshSessionUseCase } from '../../../../../src/modules/accounts/application/use-cases/refresh-session.use-case.js';
import { AccountStatus } from '../../../../../src/modules/accounts/domain/account-status.js';

const NOW = new Date('2026-09-20T02:00:00.000Z');
const SESSION_ID = 'a23394c1-c131-4b77-bf0d-c39bc11bf81e';
const REFRESH_TOKEN = 'r'.repeat(43);
const ACCOUNT: AuthenticationAccount = {
  email: 'student@u.nus.edu',
  id: '4a84f480-b1cb-4b81-b632-8bb49034b9e7',
  isAdmin: false,
  passwordHash: 'stored-password-hash',
  status: AccountStatus.Active,
  username: 'Arthur3219',
};

class FixedClock implements ClockPort {
  now(): Date {
    return NOW;
  }
}

class FixedIdGenerator implements IdGeneratorPort {
  generate(): string {
    return SESSION_ID;
  }
}

class StubRefreshTokens implements RefreshTokenPort {
  readonly hashedTokens: string[] = [];

  generate(): string {
    return REFRESH_TOKEN;
  }

  hash(token: string): string {
    this.hashedTokens.push(token);
    return `hashed:${token}`;
  }
}

class StubAccessTokens implements AccessTokenPort {
  readonly issueInputs: IssueAccessTokenInput[] = [];

  issue(input: IssueAccessTokenInput): Promise<string> {
    this.issueInputs.push(input);
    return Promise.resolve('signed-access-token');
  }

  verify(): Promise<AccessTokenClaims> {
    return Promise.reject(new Error('Not used by these tests.'));
  }
}

class StubPasswordVerifier implements PasswordVerifierPort {
  readonly inputs: Array<{ password: string; passwordHash: string | null }> =
    [];
  matches = true;

  verify(password: string, passwordHash: string | null): Promise<boolean> {
    this.inputs.push({ password, passwordHash });
    return Promise.resolve(this.matches);
  }
}

class StubAuthenticationRepository implements AuthenticationRepositoryPort {
  account: AuthenticationAccount | null = ACCOUNT;
  createdSessions: SessionRecord[] = [];
  revokedSessions: RevokeSessionInput[] = [];
  rotatedSessions: RotateSessionInput[] = [];
  rotationAccount: AuthenticatedAccount | null = ACCOUNT;

  createSession(session: SessionRecord): Promise<void> {
    this.createdSessions.push(session);
    return Promise.resolve();
  }

  findActiveSessionAccount(): Promise<AuthenticatedAccount | null> {
    return Promise.resolve(this.rotationAccount);
  }

  findAccountByEmail(): Promise<AuthenticationAccount | null> {
    return Promise.resolve(this.account);
  }

  revokeSession(input: RevokeSessionInput): Promise<void> {
    this.revokedSessions.push(input);
    return Promise.resolve();
  }

  rotateSession(
    input: RotateSessionInput,
  ): Promise<AuthenticatedAccount | null> {
    this.rotatedSessions.push(input);
    return Promise.resolve(this.rotationAccount);
  }
}

interface TestContext {
  accessTokens: StubAccessTokens;
  login: LoginUseCase;
  logout: LogoutUseCase;
  passwordVerifier: StubPasswordVerifier;
  refresh: RefreshSessionUseCase;
  refreshTokens: StubRefreshTokens;
  repository: StubAuthenticationRepository;
}

function createContext(): TestContext {
  const clock = new FixedClock();
  const accessTokens = new StubAccessTokens();
  const refreshTokens = new StubRefreshTokens();
  const passwordVerifier = new StubPasswordVerifier();
  const repository = new StubAuthenticationRepository();
  const sessionTokenIssuer = new SessionTokenIssuer({
    accessTokens,
    clock,
    idGenerator: new FixedIdGenerator(),
    refreshTokens,
  });

  return {
    accessTokens,
    login: new LoginUseCase({
      passwordVerifier,
      repository,
      sessionTokenIssuer,
    }),
    logout: new LogoutUseCase({ clock, refreshTokens, repository }),
    passwordVerifier,
    refresh: new RefreshSessionUseCase({
      clock,
      refreshTokens,
      repository,
      sessionTokenIssuer,
    }),
    refreshTokens,
    repository,
  };
}

describe('authentication use cases', () => {
  it('logs in an active account and persists only the refresh-token hash', async () => {
    const context = createContext();

    await expect(
      context.login.execute({
        email: ' Student@U.NUS.EDU ',
        password: 'Strong!Pass',
      }),
    ).resolves.toEqual({
      accessToken: 'signed-access-token',
      expiresIn: 900,
      refreshToken: REFRESH_TOKEN,
      tokenType: 'Bearer',
      user: {
        id: ACCOUNT.id,
        isAdmin: false,
        username: ACCOUNT.username,
      },
    });
    expect(context.passwordVerifier.inputs).toEqual([
      { password: 'Strong!Pass', passwordHash: ACCOUNT.passwordHash },
    ]);
    expect(context.repository.createdSessions).toEqual([
      {
        createdAt: NOW,
        expiresAt: new Date(NOW.getTime() + REFRESH_SESSION_LIFETIME_MS),
        id: SESSION_ID,
        refreshTokenHash: `hashed:${REFRESH_TOKEN}`,
        userId: ACCOUNT.id,
      },
    ]);
    expect(context.repository.createdSessions[0]).not.toHaveProperty(
      'refreshToken',
    );
    expect(context.accessTokens.issueInputs).toEqual([
      {
        expiresAt: new Date(
          NOW.getTime() + ACCESS_TOKEN_LIFETIME_SECONDS * 1000,
        ),
        isAdmin: false,
        issuedAt: NOW,
        sessionId: SESSION_ID,
        userId: ACCOUNT.id,
      },
    ]);
  });

  it('issues an administrator access token from the current account state', async () => {
    const context = createContext();
    context.repository.account = { ...ACCOUNT, isAdmin: true };

    await context.login.execute({
      email: ACCOUNT.email,
      password: 'Strong!Pass',
    });

    expect(context.accessTokens.issueInputs).toEqual([
      expect.objectContaining({ isAdmin: true }),
    ]);
  });

  it('performs dummy password verification for an unknown account', async () => {
    const context = createContext();
    context.repository.account = null;
    context.passwordVerifier.matches = false;

    await expect(
      context.login.execute({
        email: ACCOUNT.email,
        password: 'Incorrect!Pass',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(context.passwordVerifier.inputs).toEqual([
      { password: 'Incorrect!Pass', passwordHash: null },
    ]);
    expect(context.repository.createdSessions).toHaveLength(0);
  });

  it('does not create a session for a non-active account', async () => {
    const context = createContext();
    context.repository.account = {
      ...ACCOUNT,
      status: AccountStatus.PendingVerification,
    };

    await expect(
      context.login.execute({
        email: ACCOUNT.email,
        password: 'Strong!Pass',
      }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_NOT_ACTIVE' });
    expect(context.repository.createdSessions).toHaveLength(0);
  });

  it('rotates a valid refresh session and returns a new token pair', async () => {
    const context = createContext();

    await expect(
      context.refresh.execute({ refreshToken: 'current-refresh-token' }),
    ).resolves.toMatchObject({
      accessToken: 'signed-access-token',
      refreshToken: REFRESH_TOKEN,
      user: { id: ACCOUNT.id },
    });
    expect(context.repository.rotatedSessions).toEqual([
      {
        currentRefreshTokenHash: 'hashed:current-refresh-token',
        now: NOW,
        replacement: {
          createdAt: NOW,
          expiresAt: new Date(NOW.getTime() + REFRESH_SESSION_LIFETIME_MS),
          id: SESSION_ID,
          refreshTokenHash: `hashed:${REFRESH_TOKEN}`,
        },
      },
    ]);
  });

  it('rejects an invalid or previously used refresh token', async () => {
    const context = createContext();
    context.repository.rotationAccount = null;

    await expect(
      context.refresh.execute({ refreshToken: 'invalid-refresh-token' }),
    ).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_INVALID_OR_EXPIRED',
    });
  });

  it('logs out idempotently by revoking the hashed refresh token', async () => {
    const context = createContext();

    await expect(
      context.logout.execute({ refreshToken: 'current-refresh-token' }),
    ).resolves.toBeUndefined();
    expect(context.repository.revokedSessions).toEqual([
      {
        now: NOW,
        refreshTokenHash: 'hashed:current-refresh-token',
      },
    ]);
  });
});
