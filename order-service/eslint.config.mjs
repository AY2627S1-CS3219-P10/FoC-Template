/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of order-service/eslint.config.mjs tooling configuration.
 * Author review: Validated order-service/eslint.config.mjs settings for ignores; edited configuration layout and naming for consistency.
 */

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(
  {
    ignores: ['src/generated/**', 'dist/**', 'node_modules/**', 'coverage/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
);
