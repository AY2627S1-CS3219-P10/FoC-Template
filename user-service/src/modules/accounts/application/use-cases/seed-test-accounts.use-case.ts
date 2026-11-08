import { AccountStatus } from '../../domain/account-status.js';
import { NusEmail } from '../../domain/nus-email.js';
import { assertPasswordMeetsPolicy } from '../../domain/password-policy.js';
import { PhoneNumber } from '../../domain/phone-number.js';
import { Username } from '../../domain/username.js';
import { TestAccountSeedError } from '../errors/test-account-seed.error.js';
import type { ClockPort } from '../ports/clock.port.js';
import type { IdGeneratorPort } from '../ports/id-generator.port.js';
import type { PasswordHasherPort } from '../ports/password-hasher.port.js';
import type {
  TestAccountSeedRecord,
  TestAccountSeedRepositoryPort,
  TestAccountSeedResult,
} from '../ports/test-account-seed-repository.port.js';

export const MAXIMUM_TEST_ACCOUNT_COUNT = 100;

export interface TestAccountSeedInput {
  email: string;
  password: string;
  phoneNumber: string;
  username: string;
}

export interface SeedTestAccountsDependencies {
  clock: ClockPort;
  idGenerator: IdGeneratorPort;
  passwordHasher: PasswordHasherPort;
  repository: TestAccountSeedRepositoryPort;
}

export class SeedTestAccountsUseCase {
  constructor(private readonly dependencies: SeedTestAccountsDependencies) {}

  async execute(
    inputs: TestAccountSeedInput[],
  ): Promise<TestAccountSeedResult> {
    if (inputs.length === 0 || inputs.length > MAXIMUM_TEST_ACCOUNT_COUNT) {
      throw new TestAccountSeedError(
        `Test account seed must contain between 1 and ${MAXIMUM_TEST_ACCOUNT_COUNT} accounts.`,
      );
    }

    const normalized = inputs.map((input) => {
      assertPasswordMeetsPolicy(input.password);

      return {
        email: NusEmail.create(input.email).value,
        password: input.password,
        phoneNumber: PhoneNumber.create(input.phoneNumber).value,
        username: Username.create(input.username).value,
      };
    });

    this.assertDistinct(normalized, 'email');
    this.assertDistinct(normalized, 'phoneNumber');
    this.assertDistinct(normalized, 'username');

    const emailVerifiedAt = this.dependencies.clock.now();
    const records: TestAccountSeedRecord[] = await Promise.all(
      normalized.map(async (input) => ({
        email: input.email,
        emailVerifiedAt,
        eventId: this.dependencies.idGenerator.generate(),
        id: this.dependencies.idGenerator.generate(),
        isAdmin: false as const,
        passwordHash: await this.dependencies.passwordHasher.hash(
          input.password,
        ),
        phoneNumber: input.phoneNumber,
        status: AccountStatus.Active as const,
        username: input.username,
      })),
    );

    return this.dependencies.repository.seedTestAccounts(records);
  }

  private assertDistinct<T extends Record<string, string>>(
    inputs: T[],
    field: keyof T,
  ): void {
    const values = inputs.map((input) => String(input[field]).toLowerCase());

    if (new Set(values).size !== values.length) {
      throw new TestAccountSeedError(
        `Test account seed ${String(field)} values must be distinct.`,
      );
    }
  }
}
