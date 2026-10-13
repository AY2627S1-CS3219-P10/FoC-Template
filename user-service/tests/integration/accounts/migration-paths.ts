import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Repository tests must use the same complete schema as the generated client.
export const MIGRATION_PATHS = readdirSync('prisma/migrations', {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()
  .map((name) => resolve('prisma/migrations', name, 'migration.sql'));
