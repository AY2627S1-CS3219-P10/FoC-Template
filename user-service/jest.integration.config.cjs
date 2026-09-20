const baseConfig = require('./jest.config.cjs');

/** @type {import('jest').Config} */
module.exports = {
  ...baseConfig,
  collectCoverageFrom: [],
  testMatch: ['<rootDir>/tests/**/*.integration-spec.ts'],
  testTimeout: 60_000,
};
