import configuration from '../../src/infrastructure/configuration';

describe('credit service configuration', () => {
  const originalEnvironment = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnvironment };
    process.env.CREDIT_INTERNAL_API_TOKEN =
      'configuration-test-token-at-least-32-characters';
    delete process.env.DATABASE_POOL_MAX;
    delete process.env.DATABASE_CONNECTION_TIMEOUT_MS;
    delete process.env.DATABASE_IDLE_TIMEOUT_MS;
    delete process.env.DATABASE_STARTUP_TIMEOUT_SECONDS;
    delete process.env.DATABASE_RETRY_INTERVAL_SECONDS;
  });

  afterAll(() => {
    process.env = originalEnvironment;
  });

  it('uses bounded database recovery and pool defaults', () => {
    expect(configuration()).toMatchObject({
      security: {
        internalApiToken: 'configuration-test-token-at-least-32-characters',
      },
      database: {
        poolMax: 20,
        connectionTimeoutMs: 5_000,
        idleTimeoutMs: 30_000,
        startupTimeoutSeconds: 55,
        retryIntervalSeconds: 2,
      },
    });
  });

  it('rejects a missing or weak internal service token', () => {
    delete process.env.CREDIT_INTERNAL_API_TOKEN;
    expect(() => configuration()).toThrow('at least 32');
    process.env.CREDIT_INTERNAL_API_TOKEN = 'too-short';
    expect(() => configuration()).toThrow('at least 32');
  });

  it('rejects startup windows that exceed the recovery objective', () => {
    process.env.DATABASE_STARTUP_TIMEOUT_SECONDS = '56';
    expect(() => configuration()).toThrow('between 1 and 55');
  });

  it('rejects non-integer pool configuration', () => {
    process.env.DATABASE_POOL_MAX = '2.5';
    expect(() => configuration()).toThrow('between 1 and 100');
  });
});
