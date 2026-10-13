import { MAX_CREDIT_BALANCE } from '../domain/credit.constants';

const parseInteger = (
  name: string,
  rawValue: string | undefined,
  fallback: number,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number => {
  const value =
    rawValue === undefined || rawValue === '' ? fallback : Number(rawValue);
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
    throw new Error(
      `${name} must contain at least 32 non-whitespace characters`,
    );
  }
  return value;
};

const requireText = (name: string, rawValue: string | undefined): string => {
  const value = rawValue?.trim();
  if (!value) {
    throw new Error(`${name} must not be empty`);
  }
  return value;
};

const parseBoolean = (
  name: string,
  rawValue: string | undefined,
  fallback: boolean,
): boolean => {
  if (rawValue === undefined || rawValue === '') {
    return fallback;
  }
  if (rawValue === 'true') return true;
  if (rawValue === 'false') return false;
  throw new Error(`${name} must be true or false`);
};

export default () => {
  const internalApiTokens = {
    monitoring: requireSecret(
      'CREDIT_MONITORING_TOKEN',
      process.env.CREDIT_MONITORING_TOKEN,
    ),
    orderService: requireSecret(
      'CREDIT_ORDER_SERVICE_TOKEN',
      process.env.CREDIT_ORDER_SERVICE_TOKEN,
    ),
    userService: requireSecret(
      'CREDIT_USER_SERVICE_TOKEN',
      process.env.CREDIT_USER_SERVICE_TOKEN,
    ),
  };
  if (new Set(Object.values(internalApiTokens)).size !== 3) {
    throw new Error('Credit Service internal tokens must be distinct');
  }

  return {
    app: {
      port: parseInteger('PORT', process.env.PORT, 3003, 1),
      logLevel: process.env.LOG_LEVEL || 'info',
    },
    security: {
      internalApiTokens,
      jwtAccessTokenSecret: requireSecret(
        'JWT_ACCESS_TOKEN_SECRET',
        process.env.JWT_ACCESS_TOKEN_SECRET,
      ),
      jwtAudience: requireText(
        'JWT_AUDIENCE',
        process.env.JWT_AUDIENCE ?? 'foc-api',
      ),
      jwtIssuer: requireText(
        'JWT_ISSUER',
        process.env.JWT_ISSUER ?? 'foc-user-service',
      ),
    },
    database: {
      poolMax: parseInteger(
        'DATABASE_POOL_MAX',
        process.env.DATABASE_POOL_MAX,
        20,
        1,
        100,
      ),
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
        MAX_CREDIT_BALANCE,
      ),
      transactionRetries: parseInteger(
        'CREDIT_TRANSACTION_RETRIES',
        process.env.CREDIT_TRANSACTION_RETRIES,
        5,
        1,
      ),
    },
    messaging: {
      enabled: parseBoolean(
        'CREDIT_EVENTS_ENABLED',
        process.env.CREDIT_EVENTS_ENABLED,
        false,
      ),
      rabbitmqUrl: requireText(
        'RABBITMQ_URL',
        process.env.RABBITMQ_URL ?? 'amqp://localhost:5672',
      ),
      queue: requireText(
        'CREDIT_EVENTS_QUEUE',
        process.env.CREDIT_EVENTS_QUEUE ?? 'credit-service.events',
      ),
      exchange: requireText(
        'CREDIT_EVENTS_EXCHANGE',
        process.env.CREDIT_EVENTS_EXCHANGE ?? 'foc.events',
      ),
      deadLetterExchange: requireText(
        'CREDIT_EVENTS_DEAD_LETTER_EXCHANGE',
        process.env.CREDIT_EVENTS_DEAD_LETTER_EXCHANGE ?? 'foc.events.dlx',
      ),
      deadLetterQueue: requireText(
        'CREDIT_EVENTS_DEAD_LETTER_QUEUE',
        process.env.CREDIT_EVENTS_DEAD_LETTER_QUEUE ??
          'credit-service.events.dlq',
      ),
      deadLetterRoutingKey: requireText(
        'CREDIT_EVENTS_DEAD_LETTER_ROUTING_KEY',
        process.env.CREDIT_EVENTS_DEAD_LETTER_ROUTING_KEY ??
          'credit-service.events.dead',
      ),
      prefetchCount: parseInteger(
        'CREDIT_EVENTS_PREFETCH',
        process.env.CREDIT_EVENTS_PREFETCH,
        10,
        1,
        100,
      ),
      outboxPollIntervalMs: parseInteger(
        'CREDIT_OUTBOX_POLL_INTERVAL_MS',
        process.env.CREDIT_OUTBOX_POLL_INTERVAL_MS,
        1_000,
        100,
        60_000,
      ),
    },
  };
};
