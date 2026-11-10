/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of user-service/prisma.config.ts tooling configuration.
 * Author review: Validated user-service/prisma.config.ts settings for datasource, url, migrations; edited configuration layout and naming for consistency.
 */

import 'dotenv/config';

import { defineConfig } from 'prisma/config';

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    path: 'prisma/migrations',
  },
  schema: 'prisma/schema.prisma',
});
