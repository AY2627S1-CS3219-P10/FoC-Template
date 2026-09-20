import { parseAdministratorSeedConfig } from '../../../../../src/modules/accounts/infrastructure/config/administrator-seed-config.js';

const VALID_ENTRY = {
  email: 'operator@u.nus.edu',
  operator: 'Operator One',
  password: 'Strong!Pass1',
  phoneNumber: '90000001',
  username: 'Admin1',
};

function captureError(action: () => unknown): unknown {
  try {
    action();
  } catch (error: unknown) {
    return error;
  }

  throw new Error('Expected action to throw.');
}

describe('administrator seed configuration', () => {
  it('parses structured administrator definitions', () => {
    expect(parseAdministratorSeedConfig(JSON.stringify([VALID_ENTRY]))).toEqual(
      [VALID_ENTRY],
    );
  });

  it.each([undefined, '', '{}', 'not-json'])(
    'rejects missing or malformed configuration: %s',
    (value) => {
      expect(
        captureError(() => parseAdministratorSeedConfig(value)),
      ).toMatchObject({ code: 'ADMINISTRATOR_SEED_INVALID' });
    },
  );

  it('rejects entries with missing required fields', () => {
    expect(
      captureError(() =>
        parseAdministratorSeedConfig(
          JSON.stringify([{ ...VALID_ENTRY, password: undefined }]),
        ),
      ),
    ).toMatchObject({ code: 'ADMINISTRATOR_SEED_INVALID' });
  });
});
