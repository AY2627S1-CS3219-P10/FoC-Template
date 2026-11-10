/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of migration paths test cases (MIGRATION_PATHS).
 * Author review: Validated MIGRATION_PATHS value handling and returned results in user-service/migration-paths.ts; edited naming and formatting for readability.
 */

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
