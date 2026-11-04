/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  preset: 'ts-jest',
  rootDir: '.',
  // Removes the temporary cdk.out directories each synth creates.
  setupFilesAfterEnv: ['aws-cdk-lib/testhelpers/jest-autoclean'],
  // CDK's template validator warns about the deliberately fixed zones per test.
  silent: true,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
};
