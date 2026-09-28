import {
  IdempotencyConflictError,
  ReservationStateConflictError,
  SelfSettlementError,
  SettlementCourierConflictError,
} from './credit.errors';
import type { CreditReservation } from './credit.types';

export function assertDistinctSettlementParties(
  reservation: CreditReservation,
  courierId: string,
): void {
  if (reservation.requesterId === courierId) {
    throw new SelfSettlementError(reservation.errandId, courierId);
  }
}

export function assertMatchingReservation(
  existing: CreditReservation,
  requesterId: string,
  amount: number,
): void {
  if (existing.requesterId !== requesterId || existing.amount !== amount) {
    throw new IdempotencyConflictError(existing.errandId);
  }
}

export function assertSettlementCanReplay(
  reservation: CreditReservation,
  courierId: string,
): boolean {
  if (reservation.status === 'SETTLED') {
    if (reservation.courierId !== courierId) {
      throw new SettlementCourierConflictError(reservation.errandId);
    }
    return true;
  }
  if (reservation.status === 'RELEASED') {
    throw new ReservationStateConflictError(
      reservation.errandId,
      reservation.status,
      'settle',
    );
  }
  return false;
}

export function assertReleaseCanReplay(
  reservation: CreditReservation,
): boolean {
  if (reservation.status === 'RELEASED') {
    return true;
  }
  if (reservation.status === 'SETTLED') {
    throw new ReservationStateConflictError(
      reservation.errandId,
      reservation.status,
      'release',
    );
  }
  return false;
}
