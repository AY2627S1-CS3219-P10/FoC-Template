import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/prisma/client.js';
import { SeedAdministratorAccountsUseCase } from './modules/accounts/application/use-cases/seed-administrator-accounts.use-case.js';
import { parseAdministratorSeedConfig } from './modules/accounts/infrastructure/config/administrator-seed-config.js';
import { PrismaAdministratorSeedRepository } from './modules/accounts/infrastructure/persistence/prisma-administrator-seed.repository.js';
import { Argon2PasswordHasher } from './modules/accounts/infrastructure/security/argon2-password-hasher.js';
import { UuidGenerator } from './modules/accounts/infrastructure/security/uuid-generator.js';
import { SystemClock } from './modules/accounts/infrastructure/system-clock.js';

async function seedAdministrators(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const seedConfig = parseAdministratorSeedConfig(
    process.env.ADMIN_SEED_ACCOUNTS,
  );

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to seed administrators.');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  try {
    await prisma.$connect();
    const useCase = new SeedAdministratorAccountsUseCase({
      clock: new SystemClock(),
      idGenerator: new UuidGenerator(),
      passwordHasher: new Argon2PasswordHasher(),
      repository: new PrismaAdministratorSeedRepository(prisma),
    });
    const result = await useCase.execute(seedConfig);

    console.log(
      `Administrator seeding complete: ${result.createdCount} created, ${result.existingCount} already initialized.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

seedAdministrators().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error.';
  console.error(`Administrator seeding failed: ${message}`);
  process.exitCode = 1;
});
