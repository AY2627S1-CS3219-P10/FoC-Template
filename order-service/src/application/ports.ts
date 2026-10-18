import type {
  CreateErrand,
  EditErrand,
  ErrandDetails,
  ErrandRecord,
} from '../domain/errand';
import type { Transition } from '../domain/lifecycle';
export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');
export const SERVICE_CLIENTS = Symbol('SERVICE_CLIENTS');
export type ErrandSort =
  'newest' | 'oldest' | 'credits-highest' | 'credits-lowest';
export interface OperationRecord {
  id: string;
  errandId: string;
  requesterId: string;
  kind: 'CREATE' | 'EDIT' | 'DELETE' | 'CANCEL';
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  inputDigest: string;
  payload: ErrandDetails;
  expectedVersion: number | null;
  previousAmount: number | null;
  errorCode: string | null;
  errorStatus: number | null;
}
export interface OrderRepository {
  /** Administrators only: soft-delete in any state and release (Q-011 parked). */
  deleteIntent(
    actorId: string,
    id: string,
    key: string,
    digest: string,
  ): Promise<OperationRecord>;
  /**
   * D-014/D-015: the requester cancels an OPEN or ACCEPTED errand. Returns the earlier
   * succeeded operation when the errand is already CANCELLED.
   */
  cancelIntent(
    requesterId: string,
    id: string,
    key: string,
    digest: string,
  ): Promise<OperationRecord>;
  findByKey(requesterId: string, key: string): Promise<OperationRecord | null>;
  createIntent(
    requesterId: string,
    key: string,
    digest: string,
    payload: ErrandDetails,
  ): Promise<OperationRecord>;
  editIntent(
    requesterId: string,
    id: string,
    key: string,
    digest: string,
    patch: EditErrand,
  ): Promise<OperationRecord>;
  execute(
    id: string,
    credits: (operation: OperationRecord) => Promise<void>,
  ): Promise<OperationRecord>;
  operation(id: string, requesterId: string): Promise<OperationRecord | null>;
  pending(): Promise<string[]>;
  listOpen(
    limit: number,
    offset: number,
    sort?: ErrandSort,
  ): Promise<ErrandRecord[]>;
  listManaged(
    requesterId: string | null,
    limit: number,
    offset: number,
    sort?: ErrandSort,
  ): Promise<ErrandRecord[]>;
  listAssigned(
    courierId: string,
    limit: number,
    offset: number,
    sort?: ErrandSort,
  ): Promise<ErrandRecord[]>;
  find(id: string): Promise<ErrandRecord | null>;
  /**
   * Applies one lifecycle transition as a single conditional UPDATE plus its history
   * row. Returns false, changing nothing, when the errand is not in `row.from`, is
   * deleted, has a pending operation, or `actorId` does not hold the row's role.
   * `courierId` (default `actorId`) is the courier a `releasesCourier` row must still
   * find assigned; it is recorded in the history and, if the row says so, excluded.
   */
  transition(
    id: string,
    row: Transition,
    actorId: string | null,
    courierId?: string | null,
  ): Promise<boolean>;
  /** D-016/D-017: true when this courier was released from this errand before. */
  isExcluded(errandId: string, courierId: string): Promise<boolean>;
  /** Up to 100 DELIVERED errands whose auto-complete deadline has passed (DB clock). */
  dueAutoCompletions(): Promise<string[]>;
  /** Up to 100 ACCEPTED errands not picked up 30 minutes after `acceptedAt` (DB clock). */
  dueReopens(): Promise<string[]>;
}
export interface ErrandServices {
  username(userId: string, token: string): Promise<string | null>;
  isAdministrator(token: string): Promise<boolean>;
  release(errandId: string, requesterId: string, amount: number): Promise<void>;
  identity(token: string): Promise<string>;
  pickup(
    id: string,
    token: string,
  ): Promise<Pick<ErrandDetails, 'pickupSupplierName' | 'pickupLocationLabel'>>;
  reserve(errandId: string, requesterId: string, amount: number): Promise<void>;
  adjust(
    errandId: string,
    operationId: string,
    requesterId: string,
    amount: number,
  ): Promise<void>;
}
export type { CreateErrand, EditErrand };
