import { assertPasswordMeetsPolicy } from '../../domain/password-policy.js';
import { AuthenticationError } from '../errors/authentication.error.js';
import type { ClockPort } from '../ports/clock.port.js';
import type { PasswordHasherPort } from '../ports/password-hasher.port.js';
import type { PasswordVerifierPort } from '../ports/password-verifier.port.js';
import type { ProfileRepositoryPort } from '../ports/profile-repository.port.js';

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
  userId: string;
}

export interface ChangePasswordDependencies {
  clock: ClockPort;
  passwordHasher: PasswordHasherPort;
  passwordVerifier: PasswordVerifierPort;
  repository: Pick<
    ProfileRepositoryPort,
    'changePasswordAndRevokeSessions' | 'findCredentialsById'
  >;
}

export class ChangePasswordUseCase {
  constructor(private readonly dependencies: ChangePasswordDependencies) {}

  async execute(input: ChangePasswordInput): Promise<void> {
    assertPasswordMeetsPolicy(input.newPassword);
    const credentials = await this.dependencies.repository.findCredentialsById(
      input.userId,
    );
    const currentPasswordMatches =
      await this.dependencies.passwordVerifier.verify(
        input.currentPassword,
        credentials?.passwordHash ?? null,
      );

    if (!credentials || !currentPasswordMatches) {
      throw new AuthenticationError(
        'CURRENT_PASSWORD_INCORRECT',
        'Current password is incorrect.',
      );
    }

    const passwordHash = await this.dependencies.passwordHasher.hash(
      input.newPassword,
    );
    await this.dependencies.repository.changePasswordAndRevokeSessions({
      changedAt: this.dependencies.clock.now(),
      passwordHash,
      userId: input.userId,
    });
  }
}
