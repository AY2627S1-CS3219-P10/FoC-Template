import { TestAccountSeedError } from '../../application/errors/test-account-seed.error.js';
import type { TestAccountSeedInput } from '../../application/use-cases/seed-test-accounts.use-case.js';

const REQUIRED_FIELDS = [
  'email',
  'password',
  'phoneNumber',
  'username',
] as const;

export function assertTestAccountSeedAllowed(environment: {
  allowSeed: string | undefined;
  nodeEnvironment: string | undefined;
}): void {
  if (environment.nodeEnvironment?.trim().toLowerCase() !== 'staging') {
    throw new TestAccountSeedError(
      'Test account seeding requires NODE_ENV=staging.',
    );
  }

  if (environment.allowSeed !== 'true') {
    throw new TestAccountSeedError(
      'ALLOW_TEST_ACCOUNT_SEED=true is required to seed test accounts.',
    );
  }
}

export function parseTestAccountSeedConfig(
  value: string | undefined,
): TestAccountSeedInput[] {
  if (!value) {
    throw new TestAccountSeedError(
      'TEST_ACCOUNT_SEED_ACCOUNTS must contain the test account definitions.',
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new TestAccountSeedError(
      'TEST_ACCOUNT_SEED_ACCOUNTS must be valid JSON.',
    );
  }

  if (!Array.isArray(parsed)) {
    throw new TestAccountSeedError(
      'TEST_ACCOUNT_SEED_ACCOUNTS must be a JSON array.',
    );
  }

  return parsed.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new TestAccountSeedError(
        `Test account seed entry ${index + 1} must be an object.`,
      );
    }

    for (const field of REQUIRED_FIELDS) {
      if (typeof entry[field] !== 'string') {
        throw new TestAccountSeedError(
          `Test account seed entry ${index + 1} has an invalid ${field}.`,
        );
      }
    }

    return {
      email: entry.email as string,
      password: entry.password as string,
      phoneNumber: entry.phoneNumber as string,
      username: entry.username as string,
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
