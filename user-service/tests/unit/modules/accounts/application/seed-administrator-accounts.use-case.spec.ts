import type {
  AdministratorSeedRecord,
  AdministratorSeedRepositoryPort,
  AdministratorSeedResult,
} from '../../../../../src/modules/accounts/application/ports/administrator-seed-repository.port.js';
import type { ClockPort } from '../../../../../src/modules/accounts/application/ports/clock.port.js';
import type { IdGeneratorPort } from '../../../../../src/modules/accounts/application/ports/id-generator.port.js';
import type { PasswordHasherPort } from '../../../../../src/modules/accounts/application/ports/password-hasher.port.js';
import type { AdministratorSeedInput } from '../../../../../src/modules/accounts/application/use-cases/seed-administrator-accounts.use-case.js';
import { SeedAdministratorAccountsUseCase } from '../../../../../src/modules/accounts/application/use-cases/seed-administrator-accounts.use-case.js';
import { AccountStatus } from '../../../../../src/modules/accounts/domain/account-status.js';

const NOW = new Date('2026-09-20T06:00:00.000Z');

function makeInputs(): AdministratorSeedInput[] {
  return Array.from({ length: 5 }, (_, index) => ({
    email: `operator${index + 1}@u.nus.edu`,
    operator: `Operator ${index + 1}`,
    password: `Strong!Pass${index + 1}`,
    phoneNumber: `9000000${index + 1}`,
    username: `Admin${index + 1}`,
  }));
}

class FixedClock implements ClockPort {
  now(): Date {
    return NOW;
  }
}

class SequentialIds implements IdGeneratorPort {
  private next = 1;

  generate(): string {
    return `00000000-0000-4000-8000-${String(this.next++).padStart(12, '0')}`;
  }
}

class StubPasswordHasher implements PasswordHasherPort {
  inputs: string[] = [];

  hash(password: string): Promise<string> {
    this.inputs.push(password);
    return Promise.resolve(`hash:${password}`);
  }
}

class StubRepository implements AdministratorSeedRepositoryPort {
  records: AdministratorSeedRecord[] = [];

  seedAdministrators(
    records: AdministratorSeedRecord[],
  ): Promise<AdministratorSeedResult> {
    this.records = records;
    return Promise.resolve({ createdCount: 5, existingCount: 0 });
  }
}

interface TestContext {
  passwordHasher: StubPasswordHasher;
  repository: StubRepository;
  useCase: SeedAdministratorAccountsUseCase;
}

function createContext(): TestContext {
  const passwordHasher = new StubPasswordHasher();
  const repository = new StubRepository();
  const useCase = new SeedAdministratorAccountsUseCase({
    clock: new FixedClock(),
    idGenerator: new SequentialIds(),
    passwordHasher,
    repository,
  });

  return { passwordHasher, repository, useCase };
}

describe('SeedAdministratorAccountsUseCase', () => {
  it('creates exactly five active, verified administrators with hashed passwords', async () => {
    const context = createContext();
    const inputs = makeInputs();

    await expect(context.useCase.execute(inputs)).resolves.toEqual({
      createdCount: 5,
      existingCount: 0,
    });
    expect(context.repository.records).toHaveLength(5);
    expect(context.repository.records[0]).toMatchObject({
      email: 'operator1@u.nus.edu',
      emailVerifiedAt: NOW,
      isAdmin: true,
      passwordHash: 'hash:Strong!Pass1',
      status: AccountStatus.Active,
      username: 'Admin1',
    });
    expect(context.repository.records[0]).not.toHaveProperty('password');
    expect(context.passwordHasher.inputs).toEqual(
      inputs.map((input) => input.password),
    );
  });

  it('rejects a seed that does not define exactly five accounts', async () => {
    const context = createContext();

    await expect(
      context.useCase.execute(makeInputs().slice(0, 4)),
    ).rejects.toMatchObject({ code: 'ADMINISTRATOR_SEED_INVALID' });
    expect(context.repository.records).toHaveLength(0);
  });

  it('rejects duplicate operator and identity mappings before hashing', async () => {
    const context = createContext();
    const inputs = makeInputs();
    inputs[4] = { ...inputs[4]!, email: inputs[0]!.email };

    await expect(context.useCase.execute(inputs)).rejects.toMatchObject({
      code: 'ADMINISTRATOR_SEED_INVALID',
    });
    expect(context.passwordHasher.inputs).toHaveLength(0);
  });
});
