const parseInteger = (
  name: string,
  rawValue: string | undefined,
  fallback: number,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number => {
  const value = rawValue === undefined || rawValue === '' ? fallback : Number(rawValue);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${name} must be a safe integer between ${minimum} and ${maximum}`,
    );
  }
  return value;
};

const requireSecret = (name: string, rawValue: string | undefined): string => {
  const value = rawValue?.trim();
  if (!value || value.length < 32) {
    throw new Error(`${name} must contain at least 32 non-whitespace characters`);
  }
  return value;
};

export default () => ({
  app: {
    port: parseInteger('PORT', process.env.PORT, 3003, 1),
    logLevel: process.env.LOG_LEVEL || 'info',
  },
  security: {
    internalApiToken: requireSecret(
      'CREDIT_INTERNAL_API_TOKEN',
      process.env.CREDIT_INTERNAL_API_TOKEN,
    ),
  },
  database: {
    poolMax: parseInteger('DATABASE_POOL_MAX', process.env.DATABASE_POOL_MAX, 20, 1, 100),
    connectionTimeoutMs: parseInteger(
      'DATABASE_CONNECTION_TIMEOUT_MS',
      process.env.DATABASE_CONNECTION_TIMEOUT_MS,
      5_000,
      250,
      30_000,
    ),
    idleTimeoutMs: parseInteger(
      'DATABASE_IDLE_TIMEOUT_MS',
      process.env.DATABASE_IDLE_TIMEOUT_MS,
      30_000,
      1_000,
      300_000,
    ),
    startupTimeoutSeconds: parseInteger(
      'DATABASE_STARTUP_TIMEOUT_SECONDS',
      process.env.DATABASE_STARTUP_TIMEOUT_SECONDS,
      55,
      1,
      55,
    ),
    retryIntervalSeconds: parseInteger(
      'DATABASE_RETRY_INTERVAL_SECONDS',
      process.env.DATABASE_RETRY_INTERVAL_SECONDS,
      2,
      1,
      10,
    ),
  },
  credit: {
    initialBalance: parseInteger(
      'CREDIT_INITIAL_BALANCE',
      process.env.CREDIT_INITIAL_BALANCE,
      100,
      0,
    ),
    transactionRetries: parseInteger(
      'CREDIT_TRANSACTION_RETRIES',
      process.env.CREDIT_TRANSACTION_RETRIES,
      5,
      1,
    ),
  },
});
