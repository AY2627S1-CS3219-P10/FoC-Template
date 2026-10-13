import {
  assertEditable,
  assertEditFields,
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
  createdAt: new Date(),
  updatedAt: new Date(),
};
describe('FR4 edit rules', () => {
  it('allows only the requester to edit an OPEN unassigned errand at the current version', () => {
    expect(() => assertEditable(errand, 'requester', 0)).not.toThrow();
    expect(() => assertEditable(errand, 'other', 0)).toThrow('requester');
  });
  it.each([
    'ACCEPTED',
    'IN_PROGRESS',
    'DELIVERED',
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
