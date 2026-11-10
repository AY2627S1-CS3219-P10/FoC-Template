/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of update username code (UpdateUsernameInput, UpdateUsernameUseCase).
 * Author review: Validated UpdateUsernameInput, UpdateUsernameUseCase input handling, dependency calls, and success/error return paths; clarified local naming and control-flow formatting.
 */

import { Username } from '../../domain/username.js';
import { AuthenticationError } from '../errors/authentication.error.js';
import type {
  AccountProfile,
  ProfileRepositoryPort,
} from '../ports/profile-repository.port.js';

export interface UpdateUsernameInput {
  userId: string;
  username: string;
}

export class UpdateUsernameUseCase {
  constructor(
    private readonly repository: Pick<ProfileRepositoryPort, 'updateUsername'>,
  ) {}

  async execute(input: UpdateUsernameInput): Promise<AccountProfile> {
    const username = Username.create(input.username).value;
    const profile = await this.repository.updateUsername(
      input.userId,
      username,
    );

    if (!profile) {
      throw new AuthenticationError(
        'ACCESS_TOKEN_INVALID_OR_EXPIRED',
        'Access token is invalid or expired.',
      );
    }

    return profile;
  }
}
