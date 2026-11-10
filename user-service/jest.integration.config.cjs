/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of user-service/jest.integration.config.cjs tooling configuration.
 * Author review: Validated user-service/jest.integration.config.cjs settings for collectCoverageFrom, testMatch, testTimeout; edited configuration layout and naming for consistency.
 */

const baseConfig = require('./jest.config.cjs');

/** @type {import('jest').Config} */
module.exports = {
  ...baseConfig,
  collectCoverageFrom: [],
  testMatch: ['<rootDir>/tests/**/*.integration-spec.ts'],
  testTimeout: 60_000,
};
