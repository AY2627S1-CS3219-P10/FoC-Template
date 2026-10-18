import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ORDER_REPOSITORY, SERVICE_CLIENTS } from './ports';
import type { OrderRepository, ErrandServices, OperationRecord } from './ports';
import type { ErrandSort } from './ports';
import { assertEditFields, normalized, OrderError } from '../domain/errand';
import type { CreateErrand, EditErrand, ErrandRecord } from '../domain/errand';
import { alreadyApplied, transition } from '../domain/lifecycle';
import type {
  ActorRole,
  ErrandStatus,
  LifecycleAction,
} from '../domain/lifecycle';

function digest(value: object) {
  return createHash('sha256')
    .update(JSON.stringify(value, Object.keys(value).sort()))
    .digest('hex');
}
/**
 * A stable idempotency key for requests that carry none, so repeating one finds the
 * same journal operation (UUID-shaped, version nibble 8).
 */
export function derivedKey(...parts: string[]) {
  const hex = createHash('sha256').update(parts.join(':')).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
@Injectable()
export class OrderService {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly repository: OrderRepository,
    @Inject(SERVICE_CLIENTS) private readonly clients: ErrandServices,
  ) {}
  async create(
    requesterId: string,
    token: string,
    key: string,
    raw: CreateErrand,
  ) {
    const input = normalized(raw);
    const hash = digest({ kind: 'CREATE', ...input });
    const prior = await this.repository.findByKey(requesterId, key);
    if (prior && prior.inputDigest !== hash)
      throw new OrderError(
        'IDEMPOTENCY_CONFLICT',
        'This key was already used with different data.',
        409,
      );
    const op =
      prior ??
      (await this.repository.createIntent(requesterId, key, hash, {
        ...input,
        ...(await this.clients.pickup(input.pickupLocationId, token)),
      }));
    return this.submit(op);
  }
  async edit(requesterId: string, id: string, key: string, raw: EditErrand) {
    const input = normalized(raw);
    assertEditFields(input);
    return this.submit(
      await this.repository.editIntent(
        requesterId,
        id,
        key,
        digest({ kind: 'EDIT', id, ...input }),
        input,
      ),
    );
  }
  /**
   * DELETE: administrators soft-delete and release in any state (unchanged, Q-011);
   * for everyone else it is a requester cancel on the same route (D-014).
   */
  async remove(actorId: string, token: string, id: string, key: string) {
    if (!(await this.clients.isAdministrator(token)))
      return this.cancel(actorId, id, key);
    return this.submit(
      await this.repository.deleteIntent(
        actorId,
        id,
        key,
        digest({ kind: 'DELETE', id }),
      ),
    );
  }
  /**
   * D-015: the requester cancels an OPEN or ACCEPTED errand and the whole reservation
   * is released over HTTP. A repeat returns the same operation.
   */
  async cancel(
    requesterId: string,
    id: string,
    key = derivedKey('cancel', id),
  ) {
    return this.submit(
      await this.repository.cancelIntent(
        requesterId,
        id,
        key,
        digest({ kind: 'CANCEL', id }),
      ),
    );
  }
  process(id: string) {
    return this.repository.execute(id, async (op) => {
      if (op.kind === 'CREATE')
        await this.clients.reserve(
          op.errandId,
          op.requesterId,
          op.payload.offeredCredits,
        );
      else if (op.kind === 'DELETE' || op.kind === 'CANCEL')
        await this.clients.release(
          op.errandId,
          op.requesterId,
          op.payload.offeredCredits,
        );
      else if (op.payload.offeredCredits !== op.previousAmount)
        await this.clients.adjust(
          op.errandId,
          op.id,
          op.requesterId,
          op.payload.offeredCredits,
        );
    });
  }
  private async submit(prepared: OperationRecord) {
    let operation = prepared;
    try {
      operation = await this.process(prepared.id);
    } catch {
      /* journal survives; worker resumes the same operation */
    }
    if (operation.status === 'FAILED')
      throw new OrderError(
        operation.errorCode || 'CREDITS_REJECTED',
        'The required credits could not be reserved. No changes were applied.',
        operation.errorStatus || 409,
      );
    return {
      operationId: operation.id,
      status: operation.status,
      errand:
        operation.status === 'SUCCEEDED'
          ? await this.repository.find(operation.errandId)
          : null,
    };
  }
  async operation(id: string, userId: string) {
    const op = await this.repository.operation(id, userId);
    if (!op)
      throw new OrderError('OPERATION_NOT_FOUND', 'Operation not found.', 404);
    return {
      operationId: op.id,
      errandId: op.errandId,
      status: op.status,
      errorCode: op.errorCode,
      errand:
        op.status === 'SUCCEEDED'
          ? await this.repository.find(op.errandId)
          : null,
    };
  }
  list(limit: number, offset: number, sort: ErrandSort = 'newest') {
    return this.repository.listOpen(limit, offset, sort);
  }
  async managed(
    userId: string,
    token: string,
    limit: number,
    offset: number,
    sort: ErrandSort = 'newest',
    requesterId?: string,
  ) {
    const admin = await this.clients.isAdministrator(token);
    if (requesterId && requesterId !== userId && !admin)
      throw new OrderError(
        'ADMINISTRATOR_REQUIRED',
        "Only administrators may list another requester's errands.",
        403,
      );
    return this.repository.listManaged(
      requesterId ?? (admin ? null : userId),
      limit,
      offset,
      sort,
    );
  }
  /** Errands the caller is (or was) the courier for, in any status. */
  assigned(
    userId: string,
    limit: number,
    offset: number,
    sort: ErrandSort = 'newest',
  ) {
    return this.repository.listAssigned(userId, limit, offset, sort);
  }
  /** FR5/FR6: claim an OPEN errand; exactly one concurrent courier wins. */
  accept(id: string, userId: string, token: string) {
    // Q-005 (one active errand) and Q-012 (courier credit account) are parked; their
    // checks go here, before the conditional UPDATE.
    return this.act(id, 'accept', userId, token);
  }
  /** FR7.1: the assigned courier collected the item. */
  pickup(id: string, userId: string, token: string) {
    return this.act(id, 'pickup', userId, token);
  }
  /** D-005: the assigned courier handed the item over. */
  deliver(id: string, userId: string, token: string) {
    return this.act(id, 'deliver', userId, token);
  }
  /** D-007: the requester disputes a delivery; no credits move. */
  dispute(id: string, userId: string, token: string) {
    return this.act(id, 'dispute', userId, token);
  }
  /** D-006: the requester confirms (also early, from PICKED_UP); the courier is paid via the outbox. */
  confirm(id: string, userId: string, token: string) {
    return this.act(id, 'confirm', userId, token);
  }
  /**
   * D-008: completes a DELIVERED errand once its 4 h deadline has passed. Safe to run
   * any number of times; returns false when a confirm or dispute got there first.
   */
  autoComplete(id: string) {
    return this.repository.transition(
      id,
      transition('DELIVERED', 'auto-complete', 'SYSTEM'),
      null,
    );
  }
  /**
   * Resolves the transition from a fresh read and applies it as one conditional
   * UPDATE. If a concurrent change wins in between, the second read explains why.
   */
  private async act(
    id: string,
    action: LifecycleAction,
    userId: string,
    token: string,
  ) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const row = this.resolve(await this.repository.find(id), action, userId);
      if (!row || (await this.repository.transition(id, row, userId)))
        return this.find(id, userId, token);
    }
    throw new OrderError(
      'ERRAND_STATE_CHANGED',
      'The errand changed while updating it. Reload and try again.',
      409,
    );
  }
  /** The transition to apply, or null when this actor already applied it. */
  private resolve(
    errand: ErrandRecord | null,
    action: LifecycleAction,
    userId: string,
  ) {
    if (!errand || errand.deletedAt)
      throw new OrderError('ERRAND_NOT_FOUND', 'Errand not found.', 404);
    const role: ActorRole | null =
      errand.requesterId === userId
        ? 'REQUESTER'
        : errand.courierId === userId || action === 'accept'
          ? 'COURIER'
          : null;
    if (!role)
      throw new OrderError(
        'ERRAND_ACTION_FORBIDDEN',
        `Only the requester or the assigned courier may ${action} this errand.`,
        403,
      );
    const status = errand.status as ErrandStatus;
    // An accept candidate is not yet a participant, so a lost race is never a replay.
    const participant = role === 'REQUESTER' || errand.courierId === userId;
    if (participant && alreadyApplied(status, action, role)) return null;
    const row = transition(status, action, role);
    if (errand.pendingOperationId)
      throw new OrderError(
        'ERRAND_OPERATION_PENDING',
        'Another change is still being processed.',
        409,
      );
    return row;
  }
  async find(id: string, requesterId: string, token?: string) {
    const errand = await this.repository.find(id);
    if (
      !errand ||
      errand.deletedAt ||
      (errand.requesterId !== requesterId &&
        errand.courierId !== requesterId &&
        !(token && (await this.clients.isAdministrator(token))) &&
        (errand.status !== 'OPEN' || errand.courierId !== null))
    )
      throw new OrderError('ERRAND_NOT_FOUND', 'Errand not found.', 404);
    if (errand.pendingOperationId)
      throw new OrderError(
        'ERRAND_OPERATION_PENDING',
        'This errand is being updated. Try again shortly.',
        409,
      );
    return {
      ...errand,
      availableForAcceptance:
        errand.status === 'OPEN' && errand.courierId === null,
      requesterUsername: token
        ? await this.clients.username(errand.requesterId, token)
        : null,
    };
  }
}
