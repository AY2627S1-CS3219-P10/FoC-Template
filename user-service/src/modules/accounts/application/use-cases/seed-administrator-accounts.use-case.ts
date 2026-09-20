import { AccountStatus } from '../../domain/account-status.js';
import { NusEmail } from '../../domain/nus-email.js';
import { assertPasswordMeetsPolicy } from '../../domain/password-policy.js';
import { PhoneNumber } from '../../domain/phone-number.js';
import { Username } from '../../domain/username.js';
import { AdministratorSeedError } from '../errors/administrator-seed.error.js';
import type {
  AdministratorSeedRecord,
  AdministratorSeedRepositoryPort,
  AdministratorSeedResult,
} from '../ports/administrator-seed-repository.port.js';
import type { ClockPort } from '../ports/clock.port.js';
import type { IdGeneratorPort } from '../ports/id-generator.port.js';
import type { PasswordHasherPort } from '../ports/password-hasher.port.js';

export const REQUIRED_ADMINISTRATOR_COUNT = 5;

export interface AdministratorSeedInput {
  email: string;
  operator: string;
  password: string;
  phoneNumber: string;
  username: string;
}

export interface SeedAdministratorAccountsDependencies {
  clock: ClockPort;
  idGenerator: IdGeneratorPort;
  passwordHasher: PasswordHasherPort;
  repository: AdministratorSeedRepositoryPort;
}

export class SeedAdministratorAccountsUseCase {
  constructor(
    private readonly dependencies: SeedAdministratorAccountsDependencies,
  ) {}

  async execute(
    inputs: AdministratorSeedInput[],
  ): Promise<AdministratorSeedResult> {
    if (inputs.length !== REQUIRED_ADMINISTRATOR_COUNT) {
      throw new AdministratorSeedError(
        `Exactly ${REQUIRED_ADMINISTRATOR_COUNT} administrator accounts are required.`,
      );
    }

    const normalized = inputs.map((input) => {
      if (input.operator.trim().length === 0) {
        throw new AdministratorSeedError(
          'Every administrator account must name its designated operator.',
        );
      }

      assertPasswordMeetsPolicy(input.password);

      return {
        email: NusEmail.create(input.email).value,
        operator: input.operator.trim(),
        password: input.password,
        phoneNumber: PhoneNumber.create(input.phoneNumber).value,
        username: Username.create(input.username).value,
      };
    });

    this.assertDistinct(normalized, 'operator');
    this.assertDistinct(normalized, 'email');
    this.assertDistinct(normalized, 'phoneNumber');
    this.assertDistinct(normalized, 'username');

    const emailVerifiedAt = this.dependencies.clock.now();
    const records: AdministratorSeedRecord[] = await Promise.all(
      normalized.map(async (input) => ({
        email: input.email,
        emailVerifiedAt,
        id: this.dependencies.idGenerator.generate(),
        isAdmin: true as const,
        passwordHash: await this.dependencies.passwordHasher.hash(
          input.password,
        ),
        phoneNumber: input.phoneNumber,
        status: AccountStatus.Active as const,
        username: input.username,
      })),
    );

    return this.dependencies.repository.seedAdministrators(records);
  }

  private assertDistinct<T extends Record<string, string>>(
    inputs: T[],
    field: keyof T,
  ): void {
    const values = inputs.map((input) => String(input[field]).toLowerCase());

    if (new Set(values).size !== values.length) {
      throw new AdministratorSeedError(
        `Administrator seed ${String(field)} values must be distinct.`,
      );
    }
  }
}
