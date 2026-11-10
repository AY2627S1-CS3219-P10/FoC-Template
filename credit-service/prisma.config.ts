/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of credit-service/prisma.config.ts tooling configuration.
 * Author review: Validated credit-service/prisma.config.ts settings for schema, migrations, path; edited configuration layout and naming for consistency.
 */

import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
