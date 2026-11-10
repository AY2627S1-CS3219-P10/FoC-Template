/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of setup env test cases.
 * Author review: Validated setup env value handling and returned results in credit-service/setup-env.ts; edited naming and formatting for readability.
 */

process.env.LOG_LEVEL = 'silent';
process.env.CREDIT_USER_SERVICE_TOKEN =
  'integration-user-service-token-at-least-32-characters';
process.env.CREDIT_ORDER_SERVICE_TOKEN =
  'integration-order-service-token-at-least-32-characters';
process.env.CREDIT_MONITORING_TOKEN =
  'integration-monitoring-token-at-least-32-characters';
process.env.JWT_ACCESS_TOKEN_SECRET =
  'integration-access-token-secret-at-least-32-characters';
process.env.JWT_AUDIENCE = 'foc-api';
process.env.JWT_ISSUER = 'foc-user-service';
