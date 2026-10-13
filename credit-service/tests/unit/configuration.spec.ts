import configuration from '../../src/infrastructure/configuration';

describe('credit service configuration', () => {
  const originalEnvironment = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnvironment };
    process.env.CREDIT_USER_SERVICE_TOKEN =
      'configuration-user-token-at-least-32-characters';
    process.env.CREDIT_ORDER_SERVICE_TOKEN =
      'configuration-order-token-at-least-32-characters';
    process.env.CREDIT_MONITORING_TOKEN =
      'configuration-monitoring-token-at-least-32-characters';
    process.env.JWT_ACCESS_TOKEN_SECRET =
      'configuration-access-token-at-least-32-characters';
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
        internalApiTokens: {
          monitoring: 'configuration-monitoring-token-at-least-32-characters',
          orderService: 'configuration-order-token-at-least-32-characters',
          userService: 'configuration-user-token-at-least-32-characters',
        },
        jwtAccessTokenSecret:
          'configuration-access-token-at-least-32-characters',
        jwtAudience: 'foc-api',
        jwtIssuer: 'foc-user-service',
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

  it('rejects missing or weak scoped internal service tokens', () => {
    delete process.env.CREDIT_ORDER_SERVICE_TOKEN;
    expect(() => configuration()).toThrow('at least 32');
    process.env.CREDIT_ORDER_SERVICE_TOKEN = 'too-short';
    expect(() => configuration()).toThrow('at least 32');
  });

  it('rejects reused internal service credentials', () => {
    process.env.CREDIT_MONITORING_TOKEN =
      process.env.CREDIT_ORDER_SERVICE_TOKEN;
    expect(() => configuration()).toThrow('must be distinct');
  });

  it('rejects a missing or weak JWT access-token secret', () => {
    delete process.env.JWT_ACCESS_TOKEN_SECRET;
    expect(() => configuration()).toThrow('at least 32');
    process.env.JWT_ACCESS_TOKEN_SECRET = 'too-short';
    expect(() => configuration()).toThrow('at least 32');
  });

  it('rejects an initial balance above the supported account limit', () => {
    process.env.CREDIT_INITIAL_BALANCE = '10000001';
    expect(() => configuration()).toThrow('between 0 and 10000000');
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
