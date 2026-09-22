import {
  IdempotencyConflictError,
  ReservationStateConflictError,
  SettlementCourierConflictError,
} from '../../src/domain/credit.errors';
import {
  assertMatchingReservation,
  assertReleaseCanReplay,
  assertSettlementCanReplay,
} from '../../src/domain/idempotency';
import type { CreditReservation } from '../../src/domain/credit.types';

const reservation = (
  overrides: Partial<CreditReservation> = {},
): CreditReservation => ({
  id: '10000000-0000-4000-8000-000000000001',
  errandId: '20000000-0000-4000-8000-000000000001',
  requesterId: '30000000-0000-4000-8000-000000000001',
  courierId: null,
  amount: 40,
  status: 'RESERVED',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  settledAt: null,
  releasedAt: null,
  ...overrides,
});

describe('credit idempotency rules', () => {
  it('accepts an exact reservation replay', () => {
    expect(() =>
      assertMatchingReservation(
        reservation(),
        '30000000-0000-4000-8000-000000000001',
        40,
      ),
    ).not.toThrow();
  });

  it.each([
    { requesterId: '30000000-0000-4000-8000-000000000002', amount: 40 },
    { requesterId: '30000000-0000-4000-8000-000000000001', amount: 41 },
  ])('rejects a reservation replay with changed data', ({ requesterId, amount }) => {
    expect(() =>
      assertMatchingReservation(reservation(), requesterId, amount),
    ).toThrow(IdempotencyConflictError);
  });

  it('replays settlement only for the original courier', () => {
    const settled = reservation({
      status: 'SETTLED',
      courierId: '40000000-0000-4000-8000-000000000001',
      settledAt: new Date(),
    });
    expect(
      assertSettlementCanReplay(
        settled,
        '40000000-0000-4000-8000-000000000001',
      ),
    ).toBe(true);
    expect(() =>
      assertSettlementCanReplay(
        settled,
        '40000000-0000-4000-8000-000000000002',
      ),
    ).toThrow(SettlementCourierConflictError);
  });

  it('rejects settlement after release', () => {
    expect(() =>
      assertSettlementCanReplay(reservation({ status: 'RELEASED' }), '40000000-0000-4000-8000-000000000001'),
    ).toThrow(ReservationStateConflictError);
  });

  it('allows a new settlement for a reserved entry', () => {
    expect(
      assertSettlementCanReplay(
        reservation(),
        '40000000-0000-4000-8000-000000000001',
      ),
    ).toBe(false);
  });

  it('replays release and rejects release after settlement', () => {
    expect(assertReleaseCanReplay(reservation({ status: 'RELEASED' }))).toBe(
      true,
    );
    expect(() =>
      assertReleaseCanReplay(reservation({ status: 'SETTLED' })),
    ).toThrow(ReservationStateConflictError);
  });

  it('allows a new release for a reserved entry', () => {
    expect(assertReleaseCanReplay(reservation())).toBe(false);
  });
});
