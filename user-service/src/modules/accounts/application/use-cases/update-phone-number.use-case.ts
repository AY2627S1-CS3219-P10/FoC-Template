import type {
  AccountProfile,
  ProfileRepositoryPort,
} from '../ports/profile-repository.port.js';
import { AuthenticationError } from '../errors/authentication.error.js';
import { PhoneNumber } from '../../domain/phone-number.js';

export interface UpdatePhoneNumberInput {
  phoneNumber: string;
  userId: string;
}

export class UpdatePhoneNumberUseCase {
  constructor(
    private readonly repository: Pick<
      ProfileRepositoryPort,
      'updatePhoneNumber'
    >,
  ) {}

  async execute(input: UpdatePhoneNumberInput): Promise<AccountProfile> {
    const phoneNumber = PhoneNumber.create(input.phoneNumber).value;
    const profile = await this.repository.updatePhoneNumber(
      input.userId,
      phoneNumber,
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
