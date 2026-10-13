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

export class BalanceLimitExceededError extends CreditDomainError {
  constructor(userId: string, maximumBalance: number) {
    super(
      'The credit operation would exceed the maximum account balance',
      'ACCOUNT_BALANCE_LIMIT_EXCEEDED',
      409,
      { userId, maximumBalance },
    );
  }
}

export class IdempotencyConflictError extends CreditDomainError {
  constructor(errandId: string) {
    super(
      'The operation does not match the existing reservation data',
      'IDEMPOTENCY_CONFLICT',
      409,
      { errandId },
    );
  }
}

export class AdjustmentIdempotencyConflictError extends CreditDomainError {
  constructor(errandId: string, idempotencyKey: string) {
    super(
      'The adjustment idempotency key was already used with a different target amount',
      'ADJUSTMENT_IDEMPOTENCY_CONFLICT',
      409,
      { errandId, idempotencyKey },
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

export class ReservationStateConflictError extends CreditDomainError {
  constructor(
    errandId: string,
    currentStatus: string,
    requestedOperation: 'adjust' | 'settle' | 'release',
  ) {
    super(
      `Cannot ${requestedOperation} a ${currentStatus.toLowerCase()} reservation`,
      'RESERVATION_STATE_CONFLICT',
      409,
      { errandId, currentStatus, requestedOperation },
    );
  }
}

export class SelfSettlementError extends CreditDomainError {
  constructor(errandId: string, userId: string) {
    super(
      'The requester cannot receive the courier payment for their own errand',
      'SELF_SETTLEMENT_FORBIDDEN',
      409,
      { errandId, userId },
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

export class EventReplayConflictError extends CreditDomainError {
  constructor(eventId: string) {
    super(
      'The event identifier was already processed with different content',
      'EVENT_REPLAY_CONFLICT',
      409,
      { eventId },
    );
  }
}

export class InvariantViolationError extends CreditDomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CREDIT_INVARIANT_VIOLATION', 409, details);
  }
}
