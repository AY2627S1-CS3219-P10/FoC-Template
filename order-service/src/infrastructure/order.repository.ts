import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { OrderRepository, OperationRecord } from '../application/ports';
import type { ErrandSort } from '../application/ports';
import { assertEditable, OrderError } from '../domain/errand';
import type { EditErrand, ErrandDetails } from '../domain/errand';
import { AUTO_COMPLETE_AFTER_HOURS, transition } from '../domain/lifecycle';
import type {
  ErrandStatus,
  LifecycleTimestamp,
  Transition,
} from '../domain/lifecycle';
import {
  Prisma,
  type Errand,
  type ErrandOperation,
} from '../generated/prisma/client';
import { PrismaService } from './prisma.service';
import { UpstreamFailure } from './service-clients';
import {
  CORRELATION_HEADER,
  currentCorrelationId,
  withCorrelationId,
} from './correlation';
import { ERRAND_COMPLETED_EVENT } from '../domain/events';

export function operationRecord(value: ErrandOperation): OperationRecord {
  return { ...value, payload: value.payload as unknown as ErrandDetails };
}
export function sameInput(operation: OperationRecord, digest: string) {
  if (operation.inputDigest !== digest)
    throw new OrderError(
      'IDEMPOTENCY_CONFLICT',
      'This idempotency key was used for a different request.',
      409,
    );
  return operation;
}
function sortOrder(sort: ErrandSort): Prisma.ErrandOrderByWithRelationInput[] {
  if (sort === 'oldest') return [{ createdAt: 'asc' }, { id: 'asc' }];
  if (sort === 'credits-highest' || sort === 'credits-lowest')
    return [
      { offeredCredits: sort === 'credits-highest' ? 'desc' : 'asc' },
      { createdAt: 'desc' },
      { id: 'desc' },
    ];
  return [{ createdAt: 'desc' }, { id: 'desc' }];
}
/** The snapshot a journal operation stores; the credit call uses its `offeredCredits`. */
function details(errand: Errand): ErrandDetails {
  return {
    pickupLocationId: errand.pickupLocationId,
    pickupSupplierName: errand.pickupSupplierName,
    pickupLocationLabel: errand.pickupLocationLabel,
    description: errand.description,
    deliveryDestination: errand.deliveryDestination,
    instructions: errand.instructions,
    offeredCredits: errand.offeredCredits,
  };
}
type Tx = Prisma.TransactionClient;
const STAMP_COLUMNS: Record<LifecycleTimestamp, string> = {
  acceptedAt: 'accepted_at',
  pickedUpAt: 'picked_up_at',
  deliveredAt: 'delivered_at',
  disputedAt: 'disputed_at',
  completedAt: 'completed_at',
  cancelledAt: 'cancelled_at',
  expiredAt: 'expired_at',
};
/** DB clock, so app-server clock skew cannot complete an errand early (D-008). */
const AUTO_COMPLETE_DUE = Prisma.sql`"delivered_at" <= CURRENT_TIMESTAMP - make_interval(hours => ${AUTO_COMPLETE_AFTER_HOURS})`;
/**
 * Who may apply a row: accept claims an unassigned errand for a non-requester; the
 * system may only auto-complete once the deadline has passed.
 */
function actorGuard(row: Transition, actorId: string | null) {
  if (row.action === 'accept')
    return Prisma.sql`"courier_id" IS NULL AND "requester_id" <> ${actorId}::uuid`;
  if (row.actor === 'COURIER')
    return Prisma.sql`"courier_id" = ${actorId}::uuid`;
  if (row.actor === 'REQUESTER')
    return Prisma.sql`"requester_id" = ${actorId}::uuid`;
  return AUTO_COMPLETE_DUE;
}
@Injectable()
export class PrismaOrderRepository implements OrderRepository {
  constructor(private readonly prisma: PrismaService) {}
  async findByKey(requesterId: string, idempotencyKey: string) {
    const value = await this.prisma.errandOperation.findUnique({
      where: { requesterId_idempotencyKey: { requesterId, idempotencyKey } },
    });
    return value ? operationRecord(value) : null;
  }
  async createIntent(
    requesterId: string,
    key: string,
    digest: string,
    payload: ErrandDetails,
  ) {
    try {
      return operationRecord(
        await this.prisma.errandOperation.create({
          data: {
            requesterId,
            idempotencyKey: key,
            inputDigest: digest,
            correlationId: currentCorrelationId(),
            errandId: randomUUID(),
            kind: 'CREATE',
            payload: payload as unknown as Prisma.InputJsonObject,
          },
        }),
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.findByKey(requesterId, key);
        if (existing) return sameInput(existing, digest);
      }
      throw error;
    }
  }
  async editIntent(
    requesterId: string,
    id: string,
    key: string,
    digest: string,
    patch: EditErrand,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const prior = await tx.errandOperation.findUnique({
          where: {
            requesterId_idempotencyKey: { requesterId, idempotencyKey: key },
          },
        });
        if (prior) return sameInput(operationRecord(prior), digest);
        await tx.$queryRaw`SELECT "id" FROM "errands" WHERE "id" = ${id}::uuid FOR UPDATE`;
        const errand = await tx.errand.findUnique({ where: { id } });
        if (!errand)
          throw new OrderError('ERRAND_NOT_FOUND', 'Errand not found.', 404);
        assertEditable(errand, requesterId, patch.expectedVersion);
        const payload: ErrandDetails = {
          ...details(errand),
          description: patch.description ?? errand.description,
          deliveryDestination:
            patch.deliveryDestination ?? errand.deliveryDestination,
          instructions: patch.instructions ?? errand.instructions,
          offeredCredits: patch.offeredCredits ?? errand.offeredCredits,
        };
        const op = await tx.errandOperation.create({
          data: {
            requesterId,
            idempotencyKey: key,
            inputDigest: digest,
            correlationId: currentCorrelationId(),
            errandId: id,
            kind: 'EDIT',
            expectedVersion: errand.version,
            previousAmount: errand.offeredCredits,
            payload: payload as unknown as Prisma.InputJsonObject,
          },
        });
        await tx.errand.update({
          where: { id },
          data: { pendingOperationId: op.id },
        });
        return operationRecord(op);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.findByKey(requesterId, key);
        if (existing) return sameInput(existing, digest);
      }
      throw error;
    }
  }
  async execute(
    id: string,
    credits: (operation: OperationRecord) => Promise<void>,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "errand_operations" WHERE "id" = ${id}::uuid FOR UPDATE`;
        const stored = await tx.errandOperation.findUniqueOrThrow({
          where: { id },
        });
        const op = operationRecord(stored);
        if (op.status !== 'PENDING') return op;
        let creditOperation = op;
        let errand: Errand | null = null;
        if (op.kind !== 'CREATE') {
          await tx.$queryRaw`SELECT "id" FROM "errands" WHERE "id" = ${op.errandId}::uuid FOR UPDATE`;
          errand = await tx.errand.findUniqueOrThrow({
            where: { id: op.errandId },
          });
          if (
            (op.kind === 'EDIT' &&
              (errand.status !== 'OPEN' || errand.courierId !== null)) ||
            errand.deletedAt ||
            errand.pendingOperationId !== op.id ||
            errand.version !== op.expectedVersion
          )
            throw new OrderError(
              'WORKFLOW_INVARIANT_FAILED',
              'Errand state changed during a pending operation.',
              409,
            );
          // DELETE operations belong to the acting user for authorization and
          // idempotency, but Credit must validate the original errand owner.
          if (op.kind === 'DELETE') {
            creditOperation = {
              ...op,
              requesterId: errand.requesterId,
              previousAmount: errand.offeredCredits,
            };
          }
        }
        try {
          // Retries from the recovery worker reuse the original request's id.
          await withCorrelationId(
            stored.correlationId ?? currentCorrelationId() ?? randomUUID(),
            () => credits(creditOperation),
          );
        } catch (error) {
          if (!(error instanceof UpstreamFailure)) throw error;
          if (error.retryable) return op;
          if (op.kind !== 'CREATE')
            await tx.errand.update({
              where: { id: op.errandId },
              data: { pendingOperationId: null },
            });
          return operationRecord(
            await tx.errandOperation.update({
              where: { id },
              data: {
                status: 'FAILED',
                errorCode: error.code,
                errorStatus: error.status,
              },
            }),
          );
        }
        if (op.kind === 'CREATE')
          await tx.errand.create({
            data: {
              ...op.payload,
              id: op.errandId,
              requesterId: op.requesterId,
            },
          });
        else if (op.kind === 'CANCEL')
          await this.close(
            tx,
            errand!,
            transition(errand!.status, 'cancel', 'REQUESTER'),
            op.requesterId,
            stored.correlationId,
          );
        else if (op.kind === 'DELETE')
          await tx.errand.update({
            where: { id: op.errandId },
            data: {
              deletedAt: new Date(),
              version: { increment: 1 },
              pendingOperationId: null,
            },
          });
        else
          await tx.errand.update({
            where: { id: op.errandId },
            data: {
              ...op.payload,
              version: { increment: 1 },
              pendingOperationId: null,
            },
          });
        return operationRecord(
          await tx.errandOperation.update({
            where: { id },
            data: { status: 'SUCCEEDED' },
          }),
        );
      },
      { maxWait: 10000, timeout: 30000 },
    );
  }
  /**
   * Applies a credit-releasing row after the release succeeded, inside the journal's
   * transaction: clears the assignment and the lock, and writes the history row with
   * the courier the errand had.
   */
  private async close(
    tx: Tx,
    errand: Errand,
    row: Transition,
    actorId: string | null,
    correlationId: string | null,
  ) {
    await tx.$executeRaw`
      WITH changed AS (
        UPDATE "errands"
        SET "status" = ${row.to}::"ErrandStatus",
            ${Prisma.raw(`"${STAMP_COLUMNS[row.stamp!]}"`)} = CURRENT_TIMESTAMP,
            "courier_id" = NULL,
            "accepted_at" = NULL,
            "version" = "version" + 1,
            "pending_operation_id" = NULL,
            "updated_at" = CURRENT_TIMESTAMP
        WHERE "id" = ${errand.id}::uuid
        RETURNING "id"
      )
      INSERT INTO "errand_history"
        ("errand_id", "from_status", "to_status", "action", "actor_role", "actor_id", "courier_id", "correlation_id")
      SELECT "id", ${row.from}::"ErrandStatus", ${row.to}::"ErrandStatus", ${row.action},
             ${row.actor}::"ActorRole", ${actorId}::uuid, ${errand.courierId}::uuid, ${correlationId}
      FROM changed`;
  }
  async operation(id: string, requesterId: string) {
    const op = await this.prisma.errandOperation.findFirst({
      where: { id, requesterId },
    });
    return op ? operationRecord(op) : null;
  }
  async pending() {
    return (
      await this.prisma.errandOperation.findMany({
        where: { status: 'PENDING' },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
        take: 100,
      })
    ).map((op) => op.id);
  }
  listOpen(limit: number, offset: number, sort: ErrandSort = 'newest') {
    return this.prisma.errand.findMany({
      where: {
        status: 'OPEN',
        courierId: null,
        pendingOperationId: null,
        deletedAt: null,
      },
      orderBy: sortOrder(sort),
      take: limit,
      skip: offset,
    });
  }
  find(id: string) {
    return this.prisma.errand.findUnique({ where: { id } });
  }
  async dueAutoCompletions() {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "errands"
      WHERE "status" = 'DELIVERED' AND "deleted_at" IS NULL
        AND "pending_operation_id" IS NULL AND ${AUTO_COMPLETE_DUE}
      ORDER BY "delivered_at" LIMIT 100`;
    return rows.map((row) => row.id);
  }
  async transition(id: string, row: Transition, actorId: string | null) {
    if (row.releasesCredits)
      throw new Error(
        `${row.action} releases credits and must use the journal`,
      );
    const correlationId = currentCorrelationId() ?? null;
    // Entering COMPLETED writes errand.completed.v1 in the same statement (D-001).
    const event =
      row.to === 'COMPLETED'
        ? Prisma.sql`, event AS (
            INSERT INTO "outbox_events" ("aggregate_id", "event_type", "payload", "headers")
            SELECT "id", ${ERRAND_COMPLETED_EVENT},
                   jsonb_build_object('errandId', "id", 'requesterId', "requester_id",
                                      'courierId', "courier_id", 'amount', "offered_credits"),
                   jsonb_strip_nulls(jsonb_build_object(${CORRELATION_HEADER}::text, ${correlationId}::text))
            FROM changed
          )`
        : Prisma.empty;
    // One statement: concurrent callers serialise on the row lock and every loser
    // re-evaluates the WHERE clause against the winner's committed row (FR6).
    const changed = await this.prisma.$queryRaw<{ id: string }[]>`
      WITH changed AS (
        UPDATE "errands"
        SET "status" = ${row.to}::"ErrandStatus",
            ${row.stamp ? Prisma.raw(`"${STAMP_COLUMNS[row.stamp]}" = CURRENT_TIMESTAMP,`) : Prisma.empty}
            "version" = "version" + 1,
            "updated_at" = CURRENT_TIMESTAMP
            ${row.action === 'accept' ? Prisma.sql`, "courier_id" = ${actorId}::uuid` : Prisma.empty}
            ${row.completionMethod ? Prisma.sql`, "completion_method" = ${row.completionMethod}::"CompletionMethod"` : Prisma.empty}
        WHERE "id" = ${id}::uuid
          AND "status" = ${row.from}::"ErrandStatus"
          AND "deleted_at" IS NULL
          AND "pending_operation_id" IS NULL
          AND ${actorGuard(row, actorId)}
        RETURNING "id", "requester_id", "courier_id", "offered_credits"
      ), logged AS (
        INSERT INTO "errand_history"
          ("errand_id", "from_status", "to_status", "action", "actor_role", "actor_id", "courier_id", "correlation_id")
        SELECT "id", ${row.from}::"ErrandStatus", ${row.to}::"ErrandStatus", ${row.action},
               ${row.actor}::"ActorRole", ${actorId}::uuid, "courier_id", ${correlationId}
        FROM changed
      )${event}
      SELECT "id" FROM changed`;
    return changed.length === 1;
  }
  listManaged(
    requesterId: string | null,
    limit: number,
    offset: number,
    sort: ErrandSort = 'newest',
  ) {
    return this.prisma.errand.findMany({
      where: {
        deletedAt: null,
        pendingOperationId: null,
        ...(requesterId ? { requesterId } : {}),
      },
      orderBy: sortOrder(sort),
      take: limit,
      skip: offset,
    });
  }
  listAssigned(
    courierId: string,
    limit: number,
    offset: number,
    sort: ErrandSort = 'newest',
  ) {
    return this.prisma.errand.findMany({
      where: { courierId, deletedAt: null },
      orderBy: sortOrder(sort),
      take: limit,
      skip: offset,
    });
  }
  async deleteIntent(actorId: string, id: string, key: string, digest: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const prior = await tx.errandOperation.findUnique({
          where: {
            requesterId_idempotencyKey: {
              requesterId: actorId,
              idempotencyKey: key,
            },
          },
        });
        if (prior) return sameInput(operationRecord(prior), digest);
        await tx.$queryRaw`SELECT "id" FROM "errands" WHERE "id" = ${id}::uuid FOR UPDATE`;
        const errand = await tx.errand.findUnique({ where: { id } });
        if (!errand || errand.deletedAt)
          throw new OrderError('ERRAND_NOT_FOUND', 'Errand not found.', 404);
        if (errand.pendingOperationId)
          throw new OrderError(
            'ERRAND_OPERATION_PENDING',
            'Another change is still being processed.',
            409,
          );
        return this.lock(tx, errand, actorId, key, digest, 'DELETE');
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const prior = await this.findByKey(actorId, key);
        if (prior) return sameInput(prior, digest);
      }
      throw error;
    }
  }
  async cancelIntent(
    requesterId: string,
    id: string,
    key: string,
    digest: string,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const prior = await tx.errandOperation.findUnique({
          where: {
            requesterId_idempotencyKey: { requesterId, idempotencyKey: key },
          },
        });
        if (prior) return sameInput(operationRecord(prior), digest);
        await tx.$queryRaw`SELECT "id" FROM "errands" WHERE "id" = ${id}::uuid FOR UPDATE`;
        const errand = await tx.errand.findUnique({ where: { id } });
        if (!errand || errand.deletedAt)
          throw new OrderError('ERRAND_NOT_FOUND', 'Errand not found.', 404);
        if (errand.requesterId !== requesterId)
          throw new OrderError(
            'ERRAND_OWNER_REQUIRED',
            'Only the requester may cancel this errand.',
            403,
          );
        if (errand.status === 'CANCELLED') {
          const done = await tx.errandOperation.findFirst({
            where: { errandId: id, kind: 'CANCEL', status: 'SUCCEEDED' },
          });
          if (done) return operationRecord(done);
        }
        transition(errand.status as ErrandStatus, 'cancel', 'REQUESTER');
        if (errand.pendingOperationId)
          throw new OrderError(
            'ERRAND_OPERATION_PENDING',
            'Another change is still being processed.',
            409,
          );
        return this.lock(tx, errand, requesterId, key, digest, 'CANCEL');
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const prior = await this.findByKey(requesterId, key);
        if (prior) return sameInput(prior, digest);
      }
      throw error;
    }
  }
  /** Journals a release and locks the errand until `execute` finishes it. */
  private async lock(
    tx: Tx,
    errand: Errand,
    actorId: string,
    key: string,
    digest: string,
    kind: 'DELETE' | 'CANCEL',
  ) {
    const op = await tx.errandOperation.create({
      data: {
        requesterId: actorId,
        idempotencyKey: key,
        inputDigest: digest,
        correlationId: currentCorrelationId(),
        errandId: errand.id,
        kind,
        expectedVersion: errand.version,
        payload: details(errand) as unknown as Prisma.InputJsonObject,
      },
    });
    await tx.errand.update({
      where: { id: errand.id },
      data: { pendingOperationId: op.id },
    });
    return operationRecord(op);
  }
}
