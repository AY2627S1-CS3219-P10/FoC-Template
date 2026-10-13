import { NotFoundException } from '@nestjs/common';
import { AccountIdentityController } from '../../../../../src/modules/accounts/presentation/http/account-identity.controller.js';
import type { AccountProfile } from '../../../../../src/modules/accounts/application/ports/profile-repository.port.js';
import type { GetProfileUseCase } from '../../../../../src/modules/accounts/application/use-cases/get-profile.use-case.js';
import { AuthenticationError } from '../../../../../src/modules/accounts/application/errors/authentication.error.js';
import { AccountStatus } from '../../../../../src/modules/accounts/domain/account-status.js';

const PROFILE: AccountProfile = {
  createdAt: new Date('2026-01-01T00:00:00Z'),
  email: 'private@example.com',
  emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
  id: '10000000-0000-4000-8000-000000000001',
  isAdmin: false,
  phoneNumber: '91234567',
  status: AccountStatus.Active,
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  username: 'Student',
};

class StubGetProfileUseCase {
  error?: Error;

  execute(): Promise<AccountProfile> {
    return this.error ? Promise.reject(this.error) : Promise.resolve(PROFILE);
  }
}

describe('AccountIdentityController', () => {
  it('returns only id and username', async () => {
    const useCase = new StubGetProfileUseCase();
    const controller = new AccountIdentityController(
      useCase as unknown as GetProfileUseCase,
    );
    expect(await controller.find('id')).toEqual({
      id: PROFILE.id,
      username: 'Student',
    });
  });
  it('maps missing users to 404', async () => {
    const useCase = new StubGetProfileUseCase();
    useCase.error = new AuthenticationError(
      'ACCESS_TOKEN_INVALID_OR_EXPIRED',
      'Missing',
    );
    const controller = new AccountIdentityController(
      useCase as unknown as GetProfileUseCase,
    );
    await expect(controller.find('id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
