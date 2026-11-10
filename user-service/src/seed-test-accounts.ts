/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of test-account seeding commands.
 * Author review: Validated seed-test-accounts.ts input values and returned results in seed-test-accounts.ts; edited naming and formatting for readability.
 */

import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/prisma/client.js';
import { SeedTestAccountsUseCase } from './modules/accounts/application/use-cases/seed-test-accounts.use-case.js';
import {
  assertTestAccountSeedAllowed,
  parseTestAccountSeedConfig,
} from './modules/accounts/infrastructure/config/test-account-seed-config.js';
import { PrismaTestAccountSeedRepository } from './modules/accounts/infrastructure/persistence/prisma-test-account-seed.repository.js';
import { Argon2PasswordHasher } from './modules/accounts/infrastructure/security/argon2-password-hasher.js';
import { UuidGenerator } from './modules/accounts/infrastructure/security/uuid-generator.js';
import { SystemClock } from './modules/accounts/infrastructure/system-clock.js';

async function seedTestAccounts(): Promise<void> {
  assertTestAccountSeedAllowed({
    allowSeed: process.env.ALLOW_TEST_ACCOUNT_SEED,
    nodeEnvironment: process.env.NODE_ENV,
  });

  const databaseUrl = process.env.DATABASE_URL;
  const seedConfig = parseTestAccountSeedConfig(
    process.env.TEST_ACCOUNT_SEED_ACCOUNTS,
  );

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to seed test accounts.');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  try {
    await prisma.$connect();
    const useCase = new SeedTestAccountsUseCase({
      clock: new SystemClock(),
      idGenerator: new UuidGenerator(),
      passwordHasher: new Argon2PasswordHasher(),
      repository: new PrismaTestAccountSeedRepository(prisma),
    });
    const result = await useCase.execute(seedConfig);

    console.log(
      `Test account seeding complete: ${result.createdCount} created, ${result.existingCount} already initialized.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

seedTestAccounts().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error.';
  console.error(`Test account seeding failed: ${message}`);
  process.exitCode = 1;
});
