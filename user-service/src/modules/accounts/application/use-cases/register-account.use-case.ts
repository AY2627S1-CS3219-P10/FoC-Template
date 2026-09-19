import { NEW_ACCOUNT_DEFAULTS } from '../../domain/account-status.js';
import type { AccountStatus } from '../../domain/account-status.js';
import { NusEmail } from '../../domain/nus-email.js';
import { assertPasswordMeetsPolicy } from '../../domain/password-policy.js';
import { PhoneNumber } from '../../domain/phone-number.js';
import { Username } from '../../domain/username.js';
import { AccountAlreadyExistsError } from '../errors/account-already-exists.error.js';
import type { AccountRepositoryPort } from '../ports/account-repository.port.js';
import type { AccountUniquenessPort } from '../ports/account-uniqueness.port.js';
import type { IdGeneratorPort } from '../ports/id-generator.port.js';
import type { PasswordHasherPort } from '../ports/password-hasher.port.js';

export interface RegisterAccountInput {
  email: string;
  password: string;
  phoneNumber: string;
  username: string;
}

export interface RegisterAccountResult {
  email: string;
  id: string;
  isAdmin: boolean;
  phoneNumber: string;
  status: AccountStatus;
  username: string;
}

export interface RegisterAccountDependencies {
  accountRepository: AccountRepositoryPort;
  accountUniqueness: AccountUniquenessPort;
  idGenerator: IdGeneratorPort;
  passwordHasher: PasswordHasherPort;
}

export class RegisterAccountUseCase {
  constructor(private readonly dependencies: RegisterAccountDependencies) {}

  async execute(input: RegisterAccountInput): Promise<RegisterAccountResult> {
    const username = Username.create(input.username);
    const email = NusEmail.create(input.email);
    const phoneNumber = PhoneNumber.create(input.phoneNumber);
    assertPasswordMeetsPolicy(input.password);

    const [usernameTaken, emailTaken, phoneNumberTaken] = await Promise.all([
      this.dependencies.accountUniqueness.isUsernameTaken(username),
      this.dependencies.accountUniqueness.isEmailTaken(email),
      this.dependencies.accountUniqueness.isPhoneNumberTaken(phoneNumber),
    ]);

    if (usernameTaken) {
      throw new AccountAlreadyExistsError('username');
    }

    if (emailTaken) {
      throw new AccountAlreadyExistsError('email');
    }

    if (phoneNumberTaken) {
      throw new AccountAlreadyExistsError('phoneNumber');
    }

    const id = this.dependencies.idGenerator.generate();
    const passwordHash = await this.dependencies.passwordHasher.hash(
      input.password,
    );
    const account = {
      email: email.value,
      id,
      isAdmin: NEW_ACCOUNT_DEFAULTS.isAdmin,
      passwordHash,
      phoneNumber: phoneNumber.value,
      status: NEW_ACCOUNT_DEFAULTS.status,
      username: username.value,
    };

    await this.dependencies.accountRepository.create(account);

    return {
      email: account.email,
      id: account.id,
      isAdmin: account.isAdmin,
      phoneNumber: account.phoneNumber,
      status: account.status,
      username: account.username,
    };
  }
}
