import {
  AccountNotFoundError,
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
    [new ConcurrentOperationError(), 'CONCURRENT_OPERATION', 409],
    [new InvariantViolationError('broken'), 'CREDIT_INVARIANT_VIOLATION', 409],
  ])('exposes a stable code and status for %s', (error, code, statusCode) => {
    expect(error.code).toBe(code);
    expect(error.statusCode).toBe(statusCode);
  });
});
