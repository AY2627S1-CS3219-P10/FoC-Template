/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of supplier-service/jest.config.cjs tooling configuration.
 * Author review: Validated supplier-service/jest.config.cjs settings for clearMocks, collectCoverageFrom, coverageDirectory; edited configuration layout and naming for consistency.
 */

/** @type {import('jest').Config} */
module.exports = {
  clearMocks: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/generated/**'],
  coverageDirectory: 'coverage',
  extensionsToTreatAsEsm: ['.ts'],
  moduleFileExtensions: ['js', 'json', 'ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  preset: 'ts-jest/presets/default-esm',
  rootDir: '.',
  setupFiles: ['<rootDir>/tests/setup-env.ts'],
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json', useESM: true }],
  },
};
