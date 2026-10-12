import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ORDER_REPOSITORY, SERVICE_CLIENTS } from './ports';
import type { OrderRepository, ErrandServices, OperationRecord } from './ports';
import type { ErrandSort } from './ports';
import { assertEditFields, normalized, OrderError } from '../domain/errand';
import type { CreateErrand, EditErrand } from '../domain/errand';

function digest(value: object) {
  return createHash('sha256')
    .update(JSON.stringify(value, Object.keys(value).sort()))
    .digest('hex');
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
  async remove(actorId: string, token: string, id: string, key: string) {
    return this.submit(
      await this.repository.deleteIntent(
        actorId,
        await this.clients.isAdministrator(token),
        id,
        key,
        digest({ kind: 'DELETE', id }),
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
      else if (op.kind === 'DELETE') await this.clients.release(op.errandId);
      else if (op.payload.offeredCredits !== op.previousAmount)
        await this.clients.adjust(
          op.errandId,
          op.id,
          op.requesterId,
          op.previousAmount!,
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
  ) {
    return this.repository.listManaged(
      (await this.clients.isAdministrator(token)) ? null : userId,
      limit,
      offset,
      sort,
    );
  }
  async find(id: string, requesterId: string, token?: string) {
    const errand = await this.repository.find(id);
    if (
      !errand ||
      errand.deletedAt ||
      (errand.requesterId !== requesterId &&
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
      requesterUsername: token
        ? await this.clients.username(errand.requesterId, token)
        : null,
    };
  }
}
