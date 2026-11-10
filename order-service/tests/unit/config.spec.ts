/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of config test assertions and fixtures.
 * Author review: Checked "defaults DATABASE_POOL_MAX to 20 when unset" against the expected results; edited fixture naming and assertion formatting.
 */

import { validate } from '../../src/app.module';

const env = {
  DATABASE_URL: 'postgresql://order:order@127.0.0.1:5436/order',
  REDIS_URL: 'redis://127.0.0.1:6380',
  CREDIT_ORDER_SERVICE_TOKEN: 'order-credit-unit-token-at-least-32-characters',
};

describe('environment validation', () => {
  it('defaults DATABASE_POOL_MAX to 20 when unset', () => {
    expect(validate(env).DATABASE_POOL_MAX).toBe(20);
  });

  it('reads DATABASE_POOL_MAX as a number', () => {
    expect(validate({ ...env, DATABASE_POOL_MAX: '5' }).DATABASE_POOL_MAX).toBe(
      5,
    );
  });

  it.each(['0', '-1', '2.5', '101', 'twenty', ''])(
    'rejects DATABASE_POOL_MAX=%p',
    (value) => {
      expect(() => validate({ ...env, DATABASE_POOL_MAX: value })).toThrow(
        'DATABASE_POOL_MAX must be an integer from 1 to 100',
      );
    },
  );
});
