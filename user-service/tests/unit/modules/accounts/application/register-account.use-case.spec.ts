import type {
  AccountAlreadyExistsError,
  UniqueAccountField,
} from '../../../../../src/modules/accounts/application/errors/account-already-exists.error.js';
import type {
  AccountRepositoryPort,
  NewAccountRecord,
} from '../../../../../src/modules/accounts/application/ports/account-repository.port.js';
import type { AccountUniquenessPort } from '../../../../../src/modules/accounts/application/ports/account-uniqueness.port.js';
import type { IdGeneratorPort } from '../../../../../src/modules/accounts/application/ports/id-generator.port.js';
import type { PasswordHasherPort } from '../../../../../src/modules/accounts/application/ports/password-hasher.port.js';
import { RegisterAccountUseCase } from '../../../../../src/modules/accounts/application/use-cases/register-account.use-case.js';
import { AccountStatus } from '../../../../../src/modules/accounts/domain/account-status.js';
import { AccountValidationError } from '../../../../../src/modules/accounts/domain/account-validation.error.js';
import type { NusEmail } from '../../../../../src/modules/accounts/domain/nus-email.js';
import type { PhoneNumber } from '../../../../../src/modules/accounts/domain/phone-number.js';
import type { Username } from '../../../../../src/modules/accounts/domain/username.js';

const VALID_INPUT = {
  email: 'Student@U.NUS.EDU',
  password: 'Strong!Pass',
  phoneNumber: '91234567',
  username: 'Arthur3219',
};

class InMemoryAccountRepository implements AccountRepositoryPort {
  readonly createdAccounts: NewAccountRecord[] = [];

  create(account: NewAccountRecord): Promise<void> {
    this.createdAccounts.push(account);
    return Promise.resolve();
  }
}

class StubAccountUniqueness implements AccountUniquenessPort {
  readonly checks: UniqueAccountField[] = [];
  readonly checkedValues: string[] = [];
  private readonly takenFields = new Set<UniqueAccountField>();

  isEmailTaken(email: NusEmail): Promise<boolean> {
    this.checks.push('email');
    this.checkedValues.push(email.value);
    return Promise.resolve(this.takenFields.has('email'));
  }

  isPhoneNumberTaken(phoneNumber: PhoneNumber): Promise<boolean> {
    this.checks.push('phoneNumber');
    this.checkedValues.push(phoneNumber.value);
    return Promise.resolve(this.takenFields.has('phoneNumber'));
  }

  isUsernameTaken(username: Username): Promise<boolean> {
    this.checks.push('username');
    this.checkedValues.push(username.value);
    return Promise.resolve(this.takenFields.has('username'));
  }

  markTaken(field: UniqueAccountField): void {
    this.takenFields.add(field);
  }
}

class StubIdGenerator implements IdGeneratorPort {
  generate(): string {
    return '4a84f480-b1cb-4b81-b632-8bb49034b9e7';
  }
}

class StubPasswordHasher implements PasswordHasherPort {
  readonly plainTextInputs: string[] = [];

  hash(password: string): Promise<string> {
    this.plainTextInputs.push(password);
    return Promise.resolve('argon2id-password-hash');
  }
}

interface TestContext {
  accountRepository: InMemoryAccountRepository;
  accountUniqueness: StubAccountUniqueness;
  passwordHasher: StubPasswordHasher;
  useCase: RegisterAccountUseCase;
}

function createContext(): TestContext {
  const accountRepository = new InMemoryAccountRepository();
  const accountUniqueness = new StubAccountUniqueness();
  const idGenerator = new StubIdGenerator();
  const passwordHasher = new StubPasswordHasher();

  return {
    accountRepository,
    accountUniqueness,
    passwordHasher,
    useCase: new RegisterAccountUseCase({
      accountRepository,
      accountUniqueness,
      idGenerator,
      passwordHasher,
    }),
  };
}

describe('RegisterAccountUseCase', () => {
  it('validates, hashes, and saves a pending non-admin account', async () => {
    const context = createContext();

    await expect(context.useCase.execute(VALID_INPUT)).resolves.toEqual({
      email: 'student@u.nus.edu',
      id: '4a84f480-b1cb-4b81-b632-8bb49034b9e7',
      isAdmin: false,
      phoneNumber: '91234567',
      status: AccountStatus.PendingVerification,
      username: 'Arthur3219',
    });
    expect(context.passwordHasher.plainTextInputs).toEqual(['Strong!Pass']);
    expect(context.accountRepository.createdAccounts).toEqual([
      {
        email: 'student@u.nus.edu',
        id: '4a84f480-b1cb-4b81-b632-8bb49034b9e7',
        isAdmin: false,
        passwordHash: 'argon2id-password-hash',
        phoneNumber: '91234567',
        status: AccountStatus.PendingVerification,
        username: 'Arthur3219',
      },
    ]);
  });

  it.each([
    ['username', 'USERNAME_ALREADY_REGISTERED'],
    ['email', 'EMAIL_ALREADY_REGISTERED'],
    ['phoneNumber', 'PHONE_NUMBER_ALREADY_REGISTERED'],
  ] as const)(
    'rejects a duplicate %s without hashing or saving',
    async (field, expectedCode) => {
      const context = createContext();
      context.accountUniqueness.markTaken(field);

      await expect(context.useCase.execute(VALID_INPUT)).rejects.toMatchObject({
        code: expectedCode,
        field,
      } satisfies Partial<AccountAlreadyExistsError>);
      expect(context.passwordHasher.plainTextInputs).toHaveLength(0);
      expect(context.accountRepository.createdAccounts).toHaveLength(0);
    },
  );

  it('rejects invalid input before calling external ports', async () => {
    const context = createContext();

    await expect(
      context.useCase.execute({ ...VALID_INPUT, email: 'student@gmail.com' }),
    ).rejects.toBeInstanceOf(AccountValidationError);
    expect(context.accountUniqueness.checks).toHaveLength(0);
    expect(context.passwordHasher.plainTextInputs).toHaveLength(0);
    expect(context.accountRepository.createdAccounts).toHaveLength(0);
  });

  it('does not return the password or password hash', async () => {
    const context = createContext();

    const result = await context.useCase.execute(VALID_INPUT);

    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('passwordHash');
  });
});
