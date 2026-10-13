import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { AccountIdentityController } from '../../../../../src/modules/accounts/presentation/http/account-identity.controller.js';
import { GetProfileUseCase } from '../../../../../src/modules/accounts/application/use-cases/get-profile.use-case.js';
import { AuthenticationError } from '../../../../../src/modules/accounts/application/errors/authentication.error.js';
describe('AccountIdentityController', () => {
  it('returns only id and username', async () => {
    const execute = jest
      .fn<() => Promise<unknown>>()
      .mockResolvedValue({
        id: 'id',
        username: 'Student',
        email: 'private@example.com',
        phoneNumber: 'private',
        passwordHash: 'secret',
      });
    const controller = new AccountIdentityController({
      execute,
    } as unknown as GetProfileUseCase);
    expect(await controller.find('id')).toEqual({
      id: 'id',
      username: 'Student',
    });
  });
  it('maps missing users to 404', async () => {
    const execute = jest
      .fn<() => Promise<unknown>>()
      .mockRejectedValue(
        new AuthenticationError('ACCESS_TOKEN_INVALID_OR_EXPIRED', 'Missing'),
      );
    const controller = new AccountIdentityController({
      execute,
    } as unknown as GetProfileUseCase);
    await expect(controller.find('id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
