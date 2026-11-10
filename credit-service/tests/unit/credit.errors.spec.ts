/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of credit errors test cases.
 * Author review: Validated the credit errors assertions and fixture values; clarified test descriptions and assertion formatting.
 */

import {
  AccountNotFoundError,
  BalanceLimitExceededError,
  ConcurrentOperationError,
  InsufficientCreditsError,
  InvariantViolationError,
  ReservationNotFoundError,
} from '../../src/domain/credit.errors';

describe('credit domain errors', () => {
  it.each([
    [new AccountNotFoundError('user'), 'ACCOUNT_NOT_FOUND', 404],
    [new ReservationNotFoundError('errand'), 'RESERVATION_NOT_FOUND', 404],
    [new InsufficientCreditsError('user', 5, 2), 'INSUFFICIENT_CREDITS', 422],
    [
      new BalanceLimitExceededError('user', 10_000_000),
      'ACCOUNT_BALANCE_LIMIT_EXCEEDED',
      409,
    ],
    [new ConcurrentOperationError(), 'CONCURRENT_OPERATION', 409],
    [new InvariantViolationError('broken'), 'CREDIT_INVARIANT_VIOLATION', 409],
  ])('exposes a stable code and status for %s', (error, code, statusCode) => {
    expect(error.code).toBe(code);
    expect(error.statusCode).toBe(statusCode);
  });
});
