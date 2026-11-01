import { assertReviewable, normaliseReview } from '../../src/domain/review';
import type { ErrandRecord } from '../../src/domain/errand';

const completedErrand: ErrandRecord = {
  id: 'errand',
  requesterId: 'requester',
  courierId: 'courier',
  status: 'COMPLETED',
  version: 0,
  pendingOperationId: null,
  pickupLocationId: 'pickup',
  pickupSupplierName: 'Supplier',
  pickupLocationLabel: 'Pickup',
  description: 'Coffee',
  deliveryDestination: 'Library',
  instructions: 'Call on arrival',
  offeredCredits: 10,
  itemType: 'NON_PERISHABLE',
  expiresAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('review eligibility', () => {
  it('allows the requester to review a completed errand', () => {
    expect(() => assertReviewable(completedErrand, 'requester')).not.toThrow();
  });

  it.each(['courier', 'another-user'])(
    'rejects a review from %s',
    (actorId: string) => {
      expect(() => assertReviewable(completedErrand, actorId)).toThrow(
        expect.objectContaining({
          code: 'REVIEW_REQUESTER_REQUIRED',
          status: 403,
        }),
      );
    },
  );

  it.each([
    'OPEN',
    'ACCEPTED',
    'PICKED_UP',
    'DELIVERED',
    'DISPUTED',
    'CANCELLED',
    'EXPIRED',
  ])('rejects an errand in %s state', (status: ErrandRecord['status']) => {
    expect(() =>
      assertReviewable({ ...completedErrand, status }, 'requester'),
    ).toThrow(
      expect.objectContaining({
        code: 'ERRAND_NOT_REVIEWABLE',
        status: 409,
      }),
    );
  });

  it('rejects a completed errand without a courier', () => {
    expect(() =>
      assertReviewable({ ...completedErrand, courierId: null }, 'requester'),
    ).toThrow(
      expect.objectContaining({
        code: 'ERRAND_NOT_REVIEWABLE',
      }),
    );
  });

  it('rejects a deleted errand', () => {
    expect(() =>
      assertReviewable(
        { ...completedErrand, deletedAt: new Date() },
        'requester',
      ),
    ).toThrow(
      expect.objectContaining({
        code: 'ERRAND_NOT_FOUND',
        status: 404,
      }),
    );
  });
});

describe('review input', () => {
  it.each([1, 2, 3, 4, 5])('accepts %s stars', (stars) => {
    expect(normaliseReview(stars)).toEqual({
      stars,
      comment: null,
    });
  });

  it.each([0, 6, -1, 2.5, NaN, Infinity])(
    'rejects invalid stars: %s',
    (stars) => {
      expect(() => normaliseReview(stars)).toThrow(
        expect.objectContaining({
          code: 'INVALID_REVIEW_STARS',
          status: 400,
        }),
      );
    },
  );

  it('trims comments', () => {
    expect(normaliseReview(5, '  Quick delivery!  ')).toEqual({
      stars: 5,
      comment: 'Quick delivery!',
    });
  });

  it.each([undefined, '', '   '])(
    'stores an absent or blank comment as null',
    (comment: string | undefined) => {
      expect(normaliseReview(4, comment).comment).toBeNull();
    },
  );

  it('accepts exactly 1000 characters', () => {
    expect(normaliseReview(5, 'a'.repeat(1000)).comment).toHaveLength(1000);
  });

  it('rejects more than 1000 characters', () => {
    expect(() => normaliseReview(5, 'a'.repeat(1001))).toThrow(
      expect.objectContaining({
        code: 'INVALID_REVIEW_COMMENT',
        status: 400,
      }),
    );
  });
});
