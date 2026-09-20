import { AdministratorSeedError } from '../../application/errors/administrator-seed.error.js';
import type { AdministratorSeedInput } from '../../application/use-cases/seed-administrator-accounts.use-case.js';

const REQUIRED_FIELDS = [
  'email',
  'operator',
  'password',
  'phoneNumber',
  'username',
] as const;

export function parseAdministratorSeedConfig(
  value: string | undefined,
): AdministratorSeedInput[] {
  if (!value) {
    throw new AdministratorSeedError(
      'ADMIN_SEED_ACCOUNTS must contain the five administrator definitions.',
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new AdministratorSeedError('ADMIN_SEED_ACCOUNTS must be valid JSON.');
  }

  if (!Array.isArray(parsed)) {
    throw new AdministratorSeedError(
      'ADMIN_SEED_ACCOUNTS must be a JSON array.',
    );
  }

  return parsed.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new AdministratorSeedError(
        `Administrator seed entry ${index + 1} must be an object.`,
      );
    }

    for (const field of REQUIRED_FIELDS) {
      if (typeof entry[field] !== 'string') {
        throw new AdministratorSeedError(
          `Administrator seed entry ${index + 1} has an invalid ${field}.`,
        );
      }
    }

    return {
      email: entry.email as string,
      operator: entry.operator as string,
      password: entry.password as string,
      phoneNumber: entry.phoneNumber as string,
      username: entry.username as string,
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
