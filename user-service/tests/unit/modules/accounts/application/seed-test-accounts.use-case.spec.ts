import type { ClockPort } from '../../../../../src/modules/accounts/application/ports/clock.port.js';
import type { IdGeneratorPort } from '../../../../../src/modules/accounts/application/ports/id-generator.port.js';
import type { PasswordHasherPort } from '../../../../../src/modules/accounts/application/ports/password-hasher.port.js';
import type {
  TestAccountSeedRecord,
  TestAccountSeedRepositoryPort,
  TestAccountSeedResult,
} from '../../../../../src/modules/accounts/application/ports/test-account-seed-repository.port.js';
import type { TestAccountSeedInput } from '../../../../../src/modules/accounts/application/use-cases/seed-test-accounts.use-case.js';
import { SeedTestAccountsUseCase } from '../../../../../src/modules/accounts/application/use-cases/seed-test-accounts.use-case.js';
import { AccountStatus } from '../../../../../src/modules/accounts/domain/account-status.js';

const NOW = new Date('2026-11-08T12:00:00.000Z');

function makeInputs(count = 11): TestAccountSeedInput[] {
  return Array.from({ length: count }, (_, index) => ({
    email: `foc-loadtest-${String(index + 1).padStart(2, '0')}@u.nus.edu`,
    password: `Load!Test${index + 1}`,
    phoneNumber: `880000${String(index + 1).padStart(2, '0')}`,
    username: `FocLoadTest${index + 1}`,
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

class StubRepository implements TestAccountSeedRepositoryPort {
  records: TestAccountSeedRecord[] = [];

  seedTestAccounts(
    records: TestAccountSeedRecord[],
  ): Promise<TestAccountSeedResult> {
    this.records = records;
    return Promise.resolve({ createdCount: records.length, existingCount: 0 });
  }
}

function createContext(): {
  passwordHasher: StubPasswordHasher;
  repository: StubRepository;
  useCase: SeedTestAccountsUseCase;
} {
  const passwordHasher = new StubPasswordHasher();
  const repository = new StubRepository();
  const useCase = new SeedTestAccountsUseCase({
    clock: new FixedClock(),
    idGenerator: new SequentialIds(),
    passwordHasher,
    repository,
  });

  return { passwordHasher, repository, useCase };
}

describe('SeedTestAccountsUseCase', () => {
  it('creates active verified non-admin accounts and verification events', async () => {
    const context = createContext();
    const inputs = makeInputs();

    await expect(context.useCase.execute(inputs)).resolves.toEqual({
      createdCount: 11,
      existingCount: 0,
    });
    expect(context.repository.records).toHaveLength(11);
    expect(context.repository.records[0]).toMatchObject({
      email: 'foc-loadtest-01@u.nus.edu',
      emailVerifiedAt: NOW,
      isAdmin: false,
      passwordHash: 'hash:Load!Test1',
      status: AccountStatus.Active,
      username: 'FocLoadTest1',
    });
    expect(context.repository.records[0]?.eventId).not.toBe(
      context.repository.records[0]?.id,
    );
    expect(context.repository.records[0]).not.toHaveProperty('password');
    expect(context.passwordHasher.inputs).toEqual(
      inputs.map((input) => input.password),
    );
  });

  it('rejects an empty seed', async () => {
    const context = createContext();

    await expect(context.useCase.execute([])).rejects.toMatchObject({
      code: 'TEST_ACCOUNT_SEED_INVALID',
    });
    expect(context.repository.records).toHaveLength(0);
  });

  it('rejects duplicate identities before hashing', async () => {
    const context = createContext();
    const inputs = makeInputs();
    inputs[10] = { ...inputs[10]!, email: inputs[0]!.email };

    await expect(context.useCase.execute(inputs)).rejects.toMatchObject({
      code: 'TEST_ACCOUNT_SEED_INVALID',
    });
    expect(context.passwordHasher.inputs).toHaveLength(0);
  });
});
