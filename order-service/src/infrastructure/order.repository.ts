import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { OrderRepository, OperationRecord } from '../application/ports';
import type { ErrandSort } from '../application/ports';
import { assertEditable, OrderError } from '../domain/errand';
import type { EditErrand, ErrandDetails } from '../domain/errand';
import { Prisma, type ErrandOperation } from '../generated/prisma/client';
import { PrismaService } from './prisma.service';
import { UpstreamFailure } from './service-clients';

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
          pickupLocationId: errand.pickupLocationId,
          pickupSupplierName: errand.pickupSupplierName,
          pickupLocationLabel: errand.pickupLocationLabel,
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
        if (op.kind !== 'CREATE') {
          await tx.$queryRaw`SELECT "id" FROM "errands" WHERE "id" = ${op.errandId}::uuid FOR UPDATE`;
          const errand = await tx.errand.findUniqueOrThrow({
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
        }
        try {
          await credits(op);
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
  async deleteIntent(
    actorId: string,
    admin: boolean,
    id: string,
    key: string,
    digest: string,
  ) {
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
        if (!admin && errand.requesterId !== actorId)
          throw new OrderError(
            'ERRAND_OWNER_REQUIRED',
            'Only the requester or an administrator may delete this errand.',
            403,
          );
        if (errand.pendingOperationId)
          throw new OrderError(
            'ERRAND_OPERATION_PENDING',
            'Another change is still being processed.',
            409,
          );
        if (!admin && (errand.status !== 'OPEN' || errand.courierId !== null))
          throw new OrderError(
            'ERRAND_NOT_DELETABLE',
            'Only OPEN, unassigned requests can be deleted by their requester.',
            409,
          );
        const payload: ErrandDetails = {
          pickupLocationId: errand.pickupLocationId,
          pickupSupplierName: errand.pickupSupplierName,
          pickupLocationLabel: errand.pickupLocationLabel,
          description: errand.description,
          deliveryDestination: errand.deliveryDestination,
          instructions: errand.instructions,
          offeredCredits: errand.offeredCredits,
        };
        const op = await tx.errandOperation.create({
          data: {
            requesterId: actorId,
            idempotencyKey: key,
            inputDigest: digest,
            errandId: id,
            kind: 'DELETE',
            expectedVersion: errand.version,
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
        const prior = await this.findByKey(actorId, key);
        if (prior) return sameInput(prior, digest);
      }
      throw error;
    }
  }
}
