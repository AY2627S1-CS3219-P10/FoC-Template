import { AuthenticationError } from '../errors/authentication.error.js';
import type {
  AccountProfile,
  ProfileRepositoryPort,
} from '../ports/profile-repository.port.js';

export class GetProfileUseCase {
  constructor(
    private readonly repository: Pick<ProfileRepositoryPort, 'findProfileById'>,
  ) {}

  async execute(userId: string): Promise<AccountProfile> {
    const profile = await this.repository.findProfileById(userId);

    if (!profile) {
      throw new AuthenticationError(
        'ACCESS_TOKEN_INVALID_OR_EXPIRED',
        'Access token is invalid or expired.',
      );
    }

    return profile;
  }
}
