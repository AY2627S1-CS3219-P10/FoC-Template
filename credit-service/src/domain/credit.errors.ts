export abstract class CreditDomainError extends Error {
  protected constructor(
    message: string,
    readonly code: string,
    readonly statusCode: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class AccountNotFoundError extends CreditDomainError {
  constructor(userId: string) {
    super('Credit account not found', 'ACCOUNT_NOT_FOUND', 404, { userId });
  }
}

export class ReservationNotFoundError extends CreditDomainError {
  constructor(errandId: string) {
    super('Credit reservation not found', 'RESERVATION_NOT_FOUND', 404, {
      errandId,
    });
  }
}

export class InsufficientCreditsError extends CreditDomainError {
  constructor(userId: string, requested: number, available: number) {
    super('Insufficient available credits', 'INSUFFICIENT_CREDITS', 422, {
      userId,
      requested,
      available,
    });
  }
}

export class IdempotencyConflictError extends CreditDomainError {
  constructor(errandId: string) {
    super(
      'The errand identifier was already used with different reservation data',
      'IDEMPOTENCY_CONFLICT',
      409,
      { errandId },
    );
  }
}

export class ReservationStateConflictError extends CreditDomainError {
  constructor(
    errandId: string,
    currentStatus: string,
    requestedOperation: 'settle' | 'release',
  ) {
    super(
      `Cannot ${requestedOperation} a ${currentStatus.toLowerCase()} reservation`,
      'RESERVATION_STATE_CONFLICT',
      409,
      { errandId, currentStatus, requestedOperation },
    );
  }
}

export class SettlementCourierConflictError extends CreditDomainError {
  constructor(errandId: string) {
    super(
      'The reservation was already settled to a different courier',
      'SETTLEMENT_COURIER_CONFLICT',
      409,
      { errandId },
    );
  }
}

export class ConcurrentOperationError extends CreditDomainError {
  constructor() {
    super(
      'The credit operation conflicted with another request; retry it',
      'CONCURRENT_OPERATION',
      409,
    );
  }
}

export class InvariantViolationError extends CreditDomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CREDIT_INVARIANT_VIOLATION', 409, details);
  }
}
