import {
  assertTestAccountSeedAllowed,
  parseTestAccountSeedConfig,
} from '../../../../../src/modules/accounts/infrastructure/config/test-account-seed-config.js';

const VALID_ENTRY = {
  email: 'foc-loadtest-01@u.nus.edu',
  password: 'Load!Test1',
  phoneNumber: '88000001',
  username: 'FocLoadTest1',
};

function captureError(action: () => unknown): unknown {
  try {
    action();
  } catch (error: unknown) {
    return error;
  }

  throw new Error('Expected action to throw.');
}

describe('test account seed configuration', () => {
  it('parses structured test account definitions', () => {
    expect(parseTestAccountSeedConfig(JSON.stringify([VALID_ENTRY]))).toEqual([
      VALID_ENTRY,
    ]);
  });

  it.each([undefined, '', '{}', 'not-json'])(
    'rejects missing or malformed configuration: %s',
    (value) => {
      expect(
        captureError(() => parseTestAccountSeedConfig(value)),
      ).toMatchObject({ code: 'TEST_ACCOUNT_SEED_INVALID' });
    },
  );

  it('requires the explicit safety flag', () => {
    expect(
      captureError(() =>
        assertTestAccountSeedAllowed({
          allowSeed: undefined,
          nodeEnvironment: 'staging',
        }),
      ),
    ).toMatchObject({ code: 'TEST_ACCOUNT_SEED_INVALID' });
  });

  it.each(['production', 'development', undefined])(
    'refuses a non-staging environment: %s',
    (nodeEnvironment) => {
      expect(
        captureError(() =>
          assertTestAccountSeedAllowed({
            allowSeed: 'true',
            nodeEnvironment,
          }),
        ),
      ).toMatchObject({ code: 'TEST_ACCOUNT_SEED_INVALID' });
    },
  );

  it('refuses production even when the safety flag is enabled', () => {
    expect(
      captureError(() =>
        assertTestAccountSeedAllowed({
          allowSeed: 'true',
          nodeEnvironment: 'production',
        }),
      ),
    ).toMatchObject({ code: 'TEST_ACCOUNT_SEED_INVALID' });
  });

  it('allows an explicitly enabled non-production seed', () => {
    expect(() =>
      assertTestAccountSeedAllowed({
        allowSeed: 'true',
        nodeEnvironment: 'staging',
      }),
    ).not.toThrow();
  });
});
