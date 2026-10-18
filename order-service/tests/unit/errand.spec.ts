import {
  assertEditable,
  assertEditFields,
  EXPIRY_HOURS,
  expiryFor,
  normalized,
} from '../../src/domain/errand';
import type { ErrandRecord } from '../../src/domain/errand';
const errand: ErrandRecord = {
  id: 'id',
  requesterId: 'requester',
  courierId: null,
  status: 'OPEN',
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
describe('D-018 item type expiry', () => {
  it('gives FOOD 2 h and NON_PERISHABLE 24 h from creation', () => {
    const created = new Date('2026-10-18T10:00:00.123Z');
    expect(expiryFor(created, 'FOOD').toISOString()).toBe(
      '2026-10-18T12:00:00.123Z',
    );
    expect(expiryFor(created, 'NON_PERISHABLE').toISOString()).toBe(
      '2026-10-19T10:00:00.123Z',
    );
    expect(EXPIRY_HOURS).toEqual({ FOOD: 2, NON_PERISHABLE: 24 });
  });
});
describe('FR4 edit rules', () => {
  it('allows only the requester to edit an OPEN unassigned errand at the current version', () => {
    expect(() => assertEditable(errand, 'requester', 0)).not.toThrow();
    expect(() => assertEditable(errand, 'other', 0)).toThrow('requester');
  });
  it.each([
    'ACCEPTED',
    'PICKED_UP',
    'DELIVERED',
    'DISPUTED',
    'COMPLETED',
    'CANCELLED',
    'EXPIRED',
  ])('rejects %s edits', (status) =>
    expect(() => assertEditable({ ...errand, status }, 'requester', 0)).toThrow(
      'OPEN',
    ),
  );
  it('rejects assigned, pending and stale changes', () => {
    expect(() =>
      assertEditable({ ...errand, courierId: 'courier' }, 'requester', 0),
    ).toThrow('OPEN');
    expect(() =>
      assertEditable(
        { ...errand, pendingOperationId: 'pending' },
        'requester',
        0,
      ),
    ).toThrow('processed');
    expect(() => assertEditable(errand, 'requester', 1)).toThrow('Reload');
  });
  it('rejects empty edits and normalizes text without inventing optional fields', () => {
    expect(() => assertEditFields({ expectedVersion: 0 })).toThrow(
      'editable field',
    );
    expect(
      normalized({ description: ' coffee ', offeredCredits: undefined }),
    ).toEqual({ description: 'coffee' });
  });
});
