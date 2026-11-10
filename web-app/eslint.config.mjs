/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of web-app/eslint.config.mjs tooling configuration.
 * Author review: Validated web-app/eslint.config.mjs settings and referenced paths; edited configuration layout and naming for consistency.
 */

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([
    ".next/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
  ]),
]);
