import type {
  AccessTokenClaims,
  AccessTokenPort,
} from '../../../../../src/modules/accounts/application/ports/access-token.port.js';
import type { AuthenticatedAccount } from '../../../../../src/modules/accounts/application/ports/authentication-repository.port.js';
import type { ClockPort } from '../../../../../src/modules/accounts/application/ports/clock.port.js';
import type { PasswordHasherPort } from '../../../../../src/modules/accounts/application/ports/password-hasher.port.js';
import type { PasswordVerifierPort } from '../../../../../src/modules/accounts/application/ports/password-verifier.port.js';
import type {
  AccountCredentials,
  AccountProfile,
  ChangePasswordRecord,
  ProfileRepositoryPort,
} from '../../../../../src/modules/accounts/application/ports/profile-repository.port.js';
import { AuthenticateAccessTokenUseCase } from '../../../../../src/modules/accounts/application/use-cases/authenticate-access-token.use-case.js';
import { ChangePasswordUseCase } from '../../../../../src/modules/accounts/application/use-cases/change-password.use-case.js';
import { GetProfileUseCase } from '../../../../../src/modules/accounts/application/use-cases/get-profile.use-case.js';
import { UpdatePhoneNumberUseCase } from '../../../../../src/modules/accounts/application/use-cases/update-phone-number.use-case.js';
import { AccountStatus } from '../../../../../src/modules/accounts/domain/account-status.js';

const NOW = new Date('2026-09-20T04:00:00.000Z');
const USER_ID = '4a84f480-b1cb-4b81-b632-8bb49034b9e7';
const SESSION_ID = 'a23394c1-c131-4b77-bf0d-c39bc11bf81e';
const AUTHENTICATED_ACCOUNT: AuthenticatedAccount = {
  id: USER_ID,
  isAdmin: false,
  status: AccountStatus.Active,
  username: 'Arthur3219',
};
const PROFILE: AccountProfile = {
  createdAt: new Date('2026-09-19T00:00:00.000Z'),
  email: 'student@u.nus.edu',
  emailVerifiedAt: new Date('2026-09-19T01:00:00.000Z'),
  id: USER_ID,
  isAdmin: false,
  phoneNumber: '91234567',
  status: AccountStatus.Active,
  updatedAt: new Date('2026-09-19T01:00:00.000Z'),
  username: 'Arthur3219',
};

class FixedClock implements ClockPort {
  now(): Date {
    return NOW;
  }
}

class StubAccessTokens implements AccessTokenPort {
  claims: AccessTokenClaims = {
    isAdmin: false,
    sessionId: SESSION_ID,
    userId: USER_ID,
  };
  verifyError?: Error;

  issue(): Promise<string> {
    return Promise.resolve('unused');
  }

  verify(): Promise<AccessTokenClaims> {
    return this.verifyError
      ? Promise.reject(this.verifyError)
      : Promise.resolve(this.claims);
  }
}

class StubProfileRepository implements ProfileRepositoryPort {
  changedPasswords: ChangePasswordRecord[] = [];
  credentials: AccountCredentials | null = {
    id: USER_ID,
    passwordHash: 'current-hash',
  };
  profile: AccountProfile | null = PROFILE;
  updatedPhoneNumbers: Array<{ phoneNumber: string; userId: string }> = [];

  changePasswordAndRevokeSessions(input: ChangePasswordRecord): Promise<void> {
    this.changedPasswords.push(input);
    return Promise.resolve();
  }

  findCredentialsById(): Promise<AccountCredentials | null> {
    return Promise.resolve(this.credentials);
  }

  findProfileById(): Promise<AccountProfile | null> {
    return Promise.resolve(this.profile);
  }

  updatePhoneNumber(
    userId: string,
    phoneNumber: string,
  ): Promise<AccountProfile | null> {
    this.updatedPhoneNumbers.push({ phoneNumber, userId });
    return Promise.resolve(
      this.profile ? { ...this.profile, phoneNumber } : null,
    );
  }
}

class StubPasswords implements PasswordHasherPort, PasswordVerifierPort {
  hashInputs: string[] = [];
  matches = true;
  verifyInputs: Array<{ password: string; passwordHash: string | null }> = [];

  hash(password: string): Promise<string> {
    this.hashInputs.push(password);
    return Promise.resolve('new-password-hash');
  }

  verify(password: string, passwordHash: string | null): Promise<boolean> {
    this.verifyInputs.push({ password, passwordHash });
    return Promise.resolve(this.matches);
  }
}

describe('authenticated profile use cases', () => {
  it('authenticates only a JWT backed by an active database session', async () => {
    const accessTokens = new StubAccessTokens();
    const inputs: unknown[] = [];
    const authenticate = new AuthenticateAccessTokenUseCase({
      accessTokens,
      clock: new FixedClock(),
      repository: {
        findActiveSessionAccount: (input) => {
          inputs.push(input);
          return Promise.resolve(AUTHENTICATED_ACCOUNT);
        },
      },
    });

    await expect(authenticate.execute('signed-token')).resolves.toEqual(
      AUTHENTICATED_ACCOUNT,
    );
    expect(inputs).toEqual([
      { now: NOW, sessionId: SESSION_ID, userId: USER_ID },
    ]);
  });

  it('rejects invalid tokens and tokens without an active session uniformly', async () => {
    const accessTokens = new StubAccessTokens();
    accessTokens.verifyError = new Error('bad signature');
    const authenticate = new AuthenticateAccessTokenUseCase({
      accessTokens,
      clock: new FixedClock(),
      repository: { findActiveSessionAccount: () => Promise.resolve(null) },
    });

    await expect(authenticate.execute('invalid')).rejects.toMatchObject({
      code: 'ACCESS_TOKEN_INVALID_OR_EXPIRED',
    });

    accessTokens.verifyError = undefined;
    await expect(authenticate.execute('expired-session')).rejects.toMatchObject(
      { code: 'ACCESS_TOKEN_INVALID_OR_EXPIRED' },
    );
  });

  it('returns a profile and validates a changed phone number', async () => {
    const repository = new StubProfileRepository();
    const getProfile = new GetProfileUseCase(repository);
    const updatePhone = new UpdatePhoneNumberUseCase(repository);

    await expect(getProfile.execute(USER_ID)).resolves.toEqual(PROFILE);
    await expect(
      updatePhone.execute({ phoneNumber: '87654321', userId: USER_ID }),
    ).resolves.toMatchObject({ phoneNumber: '87654321' });
    expect(repository.updatedPhoneNumbers).toEqual([
      { phoneNumber: '87654321', userId: USER_ID },
    ]);
    await expect(
      updatePhone.execute({ phoneNumber: 'not-a-phone', userId: USER_ID }),
    ).rejects.toMatchObject({ code: 'PHONE_NUMBER_INVALID_FORMAT' });
  });

  it('verifies the current password, hashes the new one, and revokes sessions', async () => {
    const repository = new StubProfileRepository();
    const passwords = new StubPasswords();
    const changePassword = new ChangePasswordUseCase({
      clock: new FixedClock(),
      passwordHasher: passwords,
      passwordVerifier: passwords,
      repository,
    });

    await changePassword.execute({
      currentPassword: 'Current!Pass',
      newPassword: 'NewStrong!Pass',
      userId: USER_ID,
    });

    expect(passwords.verifyInputs).toEqual([
      { password: 'Current!Pass', passwordHash: 'current-hash' },
    ]);
    expect(passwords.hashInputs).toEqual(['NewStrong!Pass']);
    expect(repository.changedPasswords).toEqual([
      { changedAt: NOW, passwordHash: 'new-password-hash', userId: USER_ID },
    ]);
  });

  it('does not change a password when the current password is incorrect', async () => {
    const repository = new StubProfileRepository();
    const passwords = new StubPasswords();
    passwords.matches = false;
    const changePassword = new ChangePasswordUseCase({
      clock: new FixedClock(),
      passwordHasher: passwords,
      passwordVerifier: passwords,
      repository,
    });

    await expect(
      changePassword.execute({
        currentPassword: 'Incorrect!Pass',
        newPassword: 'NewStrong!Pass',
        userId: USER_ID,
      }),
    ).rejects.toMatchObject({ code: 'CURRENT_PASSWORD_INCORRECT' });
    expect(passwords.hashInputs).toHaveLength(0);
    expect(repository.changedPasswords).toHaveLength(0);
  });
});
