process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL =
  'postgresql://integration:integration@127.0.0.1:5432/integration';
process.env.REDIS_URL = 'redis://127.0.0.1:6380';
process.env.CREDIT_ORDER_SERVICE_TOKEN =
  'order-credit-integration-token-at-least-32-characters';
process.env.CREDIT_USER_SERVICE_TOKEN =
  'order-user-provisioning-token-at-least-32-characters';
process.env.CREDIT_MONITORING_TOKEN =
  'order-monitoring-token-at-least-32-characters';
process.env.JWT_ACCESS_TOKEN_SECRET =
  'order-integration-jwt-secret-at-least-32-characters';
process.env.JWT_ISSUER = 'foc-user-service';
process.env.JWT_AUDIENCE = 'foc-api';
