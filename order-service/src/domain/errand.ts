/** Credit-service rejects amounts above its MAX_CREDIT_BALANCE (10,000,000). */
export const MAX_OFFERED_CREDITS = 10_000_000;
/**
 * D-018: chosen by the requester at creation, never derived from the supplier. FOOD
 * expires sooner so it does not spoil; 24 h is as long as a requester can wait.
 */
export const ITEM_TYPES = ['FOOD', 'NON_PERISHABLE'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];
export const DEFAULT_ITEM_TYPE: ItemType = 'NON_PERISHABLE';
export const EXPIRY_HOURS: Record<ItemType, number> = {
  FOOD: 2,
  NON_PERISHABLE: 24,
};
/** Computed once at creation; reopening never moves it (D-017). */
export function expiryFor(createdAt: Date, itemType: ItemType) {
  return new Date(createdAt.getTime() + EXPIRY_HOURS[itemType] * 3_600_000);
}
export interface CreateErrand {
  pickupLocationId: string;
  description: string;
  deliveryDestination: string;
  instructions: string;
  offeredCredits: number;
  /** Optional on the wire; journal payloads from before D-018 lack it. */
  itemType?: ItemType;
}
export interface EditErrand {
  expectedVersion: number;
  description?: string;
  deliveryDestination?: string;
  instructions?: string;
  offeredCredits?: number;
}
export interface ErrandDetails extends CreateErrand {
  pickupSupplierName: string;
  pickupLocationLabel: string;
}
export interface ErrandRecord extends ErrandDetails {
  itemType: ItemType;
  expiresAt: Date;
  id: string;
  requesterId: string;
  courierId: string | null;
  status: string;
  version: number;
  pendingOperationId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}
export class OrderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
export function assertEditable(
  errand: ErrandRecord,
  requesterId: string,
  version: number,
) {
  if (errand.deletedAt)
    throw new OrderError('ERRAND_NOT_FOUND', 'Errand not found.', 404);
  if (errand.requesterId !== requesterId)
    throw new OrderError(
      'ERRAND_OWNER_REQUIRED',
      'Only the requester may edit this errand.',
      403,
    );
  if (errand.status !== 'OPEN' || errand.courierId !== null)
    throw new OrderError(
      'ERRAND_NOT_EDITABLE',
      'Only OPEN, unassigned errands may be edited.',
      409,
    );
  if (errand.pendingOperationId)
    throw new OrderError(
      'ERRAND_OPERATION_PENDING',
      'Another change is still being processed.',
      409,
    );
  if (errand.version !== version)
    throw new OrderError(
      'ERRAND_VERSION_CONFLICT',
      'The errand has changed. Reload it before editing.',
      409,
    );
}
export function normalized<T extends object>(input: T): T {
  return Object.fromEntries(
    Object.entries(input)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [
        key,
        typeof value === 'string' ? value.trim() : value,
      ]),
  ) as T;
}
export function assertEditFields(input: EditErrand) {
  if (
    Object.keys(input).filter((key) => key !== 'expectedVersion').length === 0
  )
    throw new OrderError(
      'EMPTY_ERRAND_EDIT',
      'Specify at least one editable field.',
      400,
    );
}
