/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of supplier-service/eslint.config.mjs tooling configuration.
 * Author review: Validated supplier-service/eslint.config.mjs settings for ignores, languageOptions, parserOptions; edited configuration layout and naming for consistency.
 */

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['coverage/**', 'dist/**', 'node_modules/**', 'src/generated/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        { allowExpressions: true },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
);
