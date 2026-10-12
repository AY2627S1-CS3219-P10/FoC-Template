import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LedgerEntryType,
  Prisma,
  ReservationStatus,
} from '../generated/prisma/client';
import type {
  AdjustReservationCommand,
  ConsumedEvent,
  CreditRepository,
  ReleaseCreditsCommand,
  ReserveCreditsCommand,
  SettleCreditsCommand,
} from '../application/credit.repository';
import {
  AccountNotFoundError,
  AdjustmentIdempotencyConflictError,
  BalanceLimitExceededError,
  ConcurrentOperationError,
  CreditDomainError,
  EventReplayConflictError,
  IdempotencyConflictError,
  InsufficientCreditsError,
  InvariantViolationError,
  ReservationNotFoundError,
} from '../domain/credit.errors';
import { MAX_CREDIT_BALANCE } from '../domain/credit.constants';
import {
  assertAdjustmentAllowed,
  assertDistinctSettlementParties,
  assertMatchingReservation,
  assertReleaseCanReplay,
  assertSettlementCanReplay,
} from '../domain/idempotency';
import type {
  CreditBalance,
  CreditReservation,
  OperationResult,
  ReservationResult,
  SettlementResult,
} from '../domain/credit.types';
import { PrismaService } from './prisma.service';
import {
  CreditMetricsService,
  type CreditOperation,
  type RetryCause,
} from './credit-metrics.service';

type DbAccount = {
  userId: string;
  availableCredits: number;
  reservedCredits: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

type DbReservation = {
  reservationId: string;
  errandId: string;
  requesterId: string;
  courierId: string | null;
  amount: number;
  status: ReservationStatus;
  createdAt: Date;
  updatedAt: Date;
  settledAt: Date | null;
  releasedAt: Date | null;
};

type TransactionContext = {
  operation: CreditOperation;
  correlationId: string;
};

@Injectable()
export class PrismaCreditRepository implements CreditRepository {
  private readonly logger = new Logger(PrismaCreditRepository.name);
  private readonly maxRetries: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: CreditMetricsService,
    config: ConfigService,
  ) {
    this.maxRetries = config.getOrThrow<number>('credit.transactionRetries');
  }

  async initializeAccount(
    userId: string,
    initialCredits: number,
    correlationId: string,
    consumedEvent?: ConsumedEvent,
  ): Promise<OperationResult<CreditBalance>> {
    return this.serializable({ operation: 'initialize', correlationId }, async (tx) => {
      await this.recordConsumedEvent(tx, consumedEvent);
      const existing = await tx.creditAccount.findUnique({ where: { userId } });
      if (existing) {
        return { data: this.toBalance(existing), replayed: true };
      }

      const account = await tx.creditAccount.create({
        data: { userId, availableCredits: initialCredits },
      });
      if (initialCredits > 0) {
        await tx.ledgerEntry.create({
          data: {
            accountUserId: userId,
            type: LedgerEntryType.INITIALIZE,
            amount: initialCredits,
            availableBalanceAfter: initialCredits,
            reservedBalanceAfter: 0,
            referenceKey: `user:${userId}:initialize`,
          },
        });
      }
      return { data: this.toBalance(account), replayed: false };
    }, true);
  }

  async getBalance(userId: string): Promise<CreditBalance> {
    const account = await this.prisma.creditAccount.findUnique({
      where: { userId },
    });
    if (!account) {
      throw new AccountNotFoundError(userId);
    }
    return this.toBalance(account);
  }

  async reserve(
    command: ReserveCreditsCommand,
  ): Promise<OperationResult<ReservationResult>> {
    return this.serializable(
      { operation: 'reserve', correlationId: command.correlationId },
      async (tx) => {
      const existing = await tx.creditReservation.findUnique({
        where: { errandId: command.errandId },
      });
      if (existing) {
        const reservation = this.toReservation(existing);
        assertMatchingReservation(
          reservation,
          command.requesterId,
          command.amount,
        );
        return {
          data: {
            reservation,
            requesterBalance: await this.requireAccount(
              tx,
              command.requesterId,
            ),
          },
          replayed: true,
        };
      }

      await this.lockAccounts(tx, [command.requesterId]);
      const accountBeforeReservation = await tx.creditAccount.findUnique({
        where: { userId: command.requesterId },
      });
      if (!accountBeforeReservation) {
        throw new AccountNotFoundError(command.requesterId);
      }
      if (accountBeforeReservation.availableCredits < command.amount) {
        throw new InsufficientCreditsError(
          command.requesterId,
          command.amount,
          accountBeforeReservation.availableCredits,
        );
      }

      const updated = await tx.creditAccount.updateMany({
        where: {
          userId: command.requesterId,
          availableCredits: { gte: command.amount },
        },
        data: {
          availableCredits: { decrement: command.amount },
          reservedCredits: { increment: command.amount },
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        const account = await tx.creditAccount.findUnique({
          where: { userId: command.requesterId },
        });
        if (!account) {
          throw new AccountNotFoundError(command.requesterId);
        }
        throw new InsufficientCreditsError(
          command.requesterId,
          command.amount,
          account.availableCredits,
        );
      }

      const account = await tx.creditAccount.findUniqueOrThrow({
        where: { userId: command.requesterId },
      });
      const reservation = await tx.creditReservation.create({
        data: {
          errandId: command.errandId,
          requesterId: command.requesterId,
          amount: command.amount,
        },
      });
      await tx.ledgerEntry.create({
        data: {
          accountUserId: command.requesterId,
          reservationId: reservation.reservationId,
          errandId: command.errandId,
          type: LedgerEntryType.RESERVE,
          amount: command.amount,
          availableBalanceAfter: account.availableCredits,
          reservedBalanceAfter: account.reservedCredits,
          referenceKey: `errand:${command.errandId}:reserve`,
          correlationId: command.correlationId,
        },
      });

      return {
        data: {
          reservation: this.toReservation(reservation),
          requesterBalance: this.toBalance(account),
        },
        replayed: false,
      };
      },
      true,
    );
  }

  async adjust(
    command: AdjustReservationCommand,
  ): Promise<OperationResult<ReservationResult>> {
    return this.serializable(
      { operation: 'adjust', correlationId: command.correlationId },
      async (tx) => {
      await this.lockReservation(tx, command.errandId);
      const existing = await tx.creditReservation.findUnique({
        where: { errandId: command.errandId },
      });
      if (!existing) {
        throw new ReservationNotFoundError(command.errandId);
      }

      const current = this.toReservation(existing);
      if (current.requesterId !== command.requesterId) {
        throw new IdempotencyConflictError(command.errandId);
      }

      const priorAdjustment = await tx.creditReservationAdjustment.findUnique({
        where: {
          reservationId_idempotencyKey: {
            reservationId: current.reservationId,
            idempotencyKey: command.idempotencyKey,
          },
        },
      });
      if (priorAdjustment) {
        if (priorAdjustment.targetAmount !== command.targetAmount) {
          throw new AdjustmentIdempotencyConflictError(
            command.errandId,
            command.idempotencyKey,
          );
        }
        return {
          data: {
            reservation: current,
            requesterBalance: await this.requireAccount(
              tx,
              command.requesterId,
            ),
          },
          replayed: true,
        };
      }

      assertAdjustmentAllowed(current);
      await this.lockAccounts(tx, [command.requesterId]);
      const delta = command.targetAmount - current.amount;

      if (delta > 0) {
        const updated = await tx.creditAccount.updateMany({
          where: {
            userId: command.requesterId,
            availableCredits: { gte: delta },
          },
          data: {
            availableCredits: { decrement: delta },
            reservedCredits: { increment: delta },
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) {
          const account = await this.requireAccount(tx, command.requesterId);
          throw new InsufficientCreditsError(
            command.requesterId,
            delta,
            account.availableCredits,
          );
        }
      } else if (delta < 0) {
        const releasedAmount = Math.abs(delta);
        const updated = await tx.creditAccount.updateMany({
          where: {
            userId: command.requesterId,
            reservedCredits: { gte: releasedAmount },
          },
          data: {
            availableCredits: { increment: releasedAmount },
            reservedCredits: { decrement: releasedAmount },
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) {
          throw new InvariantViolationError(
            'Requester reserved balance is lower than the adjustment amount',
            { errandId: command.errandId, requesterId: command.requesterId },
          );
        }
      }

      const reservation =
        delta === 0
          ? existing
          : await tx.creditReservation.update({
              where: { reservationId: current.reservationId },
              data: { amount: command.targetAmount },
            });
      const account = await tx.creditAccount.findUniqueOrThrow({
        where: { userId: command.requesterId },
      });
      await tx.creditReservationAdjustment.create({
        data: {
          reservationId: current.reservationId,
          idempotencyKey: command.idempotencyKey,
          previousAmount: current.amount,
          targetAmount: command.targetAmount,
          correlationId: command.correlationId,
        },
      });

      if (delta !== 0) {
        await tx.ledgerEntry.create({
          data: {
            accountUserId: command.requesterId,
            reservationId: current.reservationId,
            errandId: command.errandId,
            type:
              delta > 0
                ? LedgerEntryType.ADJUST_RESERVE
                : LedgerEntryType.ADJUST_RELEASE,
            amount: Math.abs(delta),
            availableBalanceAfter: account.availableCredits,
            reservedBalanceAfter: account.reservedCredits,
            referenceKey: `errand:${command.errandId}:adjust:${command.idempotencyKey}`,
            correlationId: command.correlationId,
          },
        });
      }

      return {
        data: {
          reservation: this.toReservation(reservation),
          requesterBalance: this.toBalance(account),
        },
        replayed: false,
      };
      },
    );
  }

  async settle(
    command: SettleCreditsCommand,
  ): Promise<OperationResult<SettlementResult>> {
    return this.serializable(
      { operation: 'settle', correlationId: command.correlationId },
      async (tx) => {
      await this.recordConsumedEvent(tx, command.consumedEvent);
      await this.lockReservation(tx, command.errandId);
      const existing = await tx.creditReservation.findUnique({
        where: { errandId: command.errandId },
      });
      if (!existing) {
        throw new ReservationNotFoundError(command.errandId);
      }

      const current = this.toReservation(existing);
      assertMatchingReservation(
        current,
        command.requesterId,
        command.amount,
      );
      assertDistinctSettlementParties(current, command.courierId);
      if (assertSettlementCanReplay(current, command.courierId)) {
        return {
          data: {
            reservation: current,
            requesterBalance: await this.requireAccount(
              tx,
              current.requesterId,
            ),
            courierBalance: await this.requireAccount(tx, command.courierId),
          },
          replayed: true,
        };
      }

      await this.lockAccounts(tx, [current.requesterId, command.courierId]);
      await this.requireAccount(tx, command.courierId);
      const requesterUpdate = await tx.creditAccount.updateMany({
        where: {
          userId: current.requesterId,
          reservedCredits: { gte: current.amount },
        },
        data: {
          reservedCredits: { decrement: current.amount },
          version: { increment: 1 },
        },
      });
      if (requesterUpdate.count !== 1) {
        throw new InvariantViolationError(
          'Requester reserved balance is lower than the reservation amount',
          { errandId: command.errandId, requesterId: current.requesterId },
        );
      }

      const requesterAfterDebit = await tx.creditAccount.findUniqueOrThrow({
        where: { userId: current.requesterId },
      });
      const courierUpdate = await tx.creditAccount.updateMany({
        where: {
          userId: command.courierId,
          availableCredits: {
            lte: MAX_CREDIT_BALANCE - current.amount,
          },
        },
        data: {
          availableCredits: { increment: current.amount },
          version: { increment: 1 },
        },
      });
      if (courierUpdate.count !== 1) {
        throw new BalanceLimitExceededError(
          command.courierId,
          MAX_CREDIT_BALANCE,
        );
      }
      const courier = await tx.creditAccount.findUniqueOrThrow({
        where: { userId: command.courierId },
      });
      const reservation = await tx.creditReservation.update({
        where: { errandId: command.errandId },
        data: {
          status: ReservationStatus.SETTLED,
          courierId: command.courierId,
          settledAt: new Date(),
        },
      });

      await tx.ledgerEntry.createMany({
        data: [
          {
            accountUserId: current.requesterId,
            reservationId: current.reservationId,
            errandId: command.errandId,
            type: LedgerEntryType.SETTLE,
            amount: current.amount,
            availableBalanceAfter: requesterAfterDebit.availableCredits,
            reservedBalanceAfter: requesterAfterDebit.reservedCredits,
            referenceKey: `errand:${command.errandId}:settle:requester`,
            correlationId: command.correlationId,
          },
          {
            accountUserId: command.courierId,
            reservationId: current.reservationId,
            errandId: command.errandId,
            type: LedgerEntryType.SETTLE,
            amount: current.amount,
            availableBalanceAfter: courier.availableCredits,
            reservedBalanceAfter: courier.reservedCredits,
            referenceKey: `errand:${command.errandId}:settle:courier`,
            correlationId: command.correlationId,
          },
        ],
      });

      const requester =
        command.courierId === current.requesterId
          ? courier
          : requesterAfterDebit;
      return {
        data: {
          reservation: this.toReservation(reservation),
          requesterBalance: this.toBalance(requester),
          courierBalance: this.toBalance(courier),
        },
        replayed: false,
      };
      },
      Boolean(command.consumedEvent),
    );
  }

  async release(
    command: ReleaseCreditsCommand,
  ): Promise<OperationResult<ReservationResult>> {
    return this.serializable(
      { operation: 'release', correlationId: command.correlationId },
      async (tx) => {
      await this.lockReservation(tx, command.errandId);
      const existing = await tx.creditReservation.findUnique({
        where: { errandId: command.errandId },
      });
      if (!existing) {
        throw new ReservationNotFoundError(command.errandId);
      }

      const current = this.toReservation(existing);
      assertMatchingReservation(
        current,
        command.requesterId,
        command.amount,
      );
      if (assertReleaseCanReplay(current)) {
        return {
          data: {
            reservation: current,
            requesterBalance: await this.requireAccount(
              tx,
              current.requesterId,
            ),
          },
          replayed: true,
        };
      }

      await this.lockAccounts(tx, [current.requesterId]);
      const updated = await tx.creditAccount.updateMany({
        where: {
          userId: current.requesterId,
          reservedCredits: { gte: current.amount },
        },
        data: {
          availableCredits: { increment: current.amount },
          reservedCredits: { decrement: current.amount },
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new InvariantViolationError(
          'Requester reserved balance is lower than the reservation amount',
          { errandId: command.errandId, requesterId: current.requesterId },
        );
      }

      const account = await tx.creditAccount.findUniqueOrThrow({
        where: { userId: current.requesterId },
      });
      const reservation = await tx.creditReservation.update({
        where: { errandId: command.errandId },
        data: {
          status: ReservationStatus.RELEASED,
          releasedAt: new Date(),
        },
      });
      await tx.ledgerEntry.create({
        data: {
          accountUserId: current.requesterId,
          reservationId: current.reservationId,
          errandId: command.errandId,
          type: LedgerEntryType.RELEASE,
          amount: current.amount,
          availableBalanceAfter: account.availableCredits,
          reservedBalanceAfter: account.reservedCredits,
          referenceKey: `errand:${command.errandId}:release`,
          correlationId: command.correlationId,
        },
      });

      return {
        data: {
          reservation: this.toReservation(reservation),
          requesterBalance: this.toBalance(account),
        },
        replayed: false,
      };
      },
    );
  }

  async isReady(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private async lockReservation(
    tx: Prisma.TransactionClient,
    errandId: string,
  ): Promise<void> {
    await tx.$queryRaw`
      SELECT "reservation_id"
      FROM "credit_reservations"
      WHERE "errand_id" = ${errandId}::uuid
      FOR UPDATE
    `;
  }

  private async lockAccounts(
    tx: Prisma.TransactionClient,
    userIds: string[],
  ): Promise<void> {
    const orderedUserIds = [...new Set(userIds)].sort();
    for (const userId of orderedUserIds) {
      await tx.$queryRaw`
        SELECT "user_id"
        FROM "credit_accounts"
        WHERE "user_id" = ${userId}::uuid
        FOR UPDATE
      `;
    }
  }

  private async requireAccount(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<CreditBalance> {
    const account = await tx.creditAccount.findUnique({ where: { userId } });
    if (!account) {
      throw new AccountNotFoundError(userId);
    }
    return this.toBalance(account);
  }

  private async recordConsumedEvent(
    tx: Prisma.TransactionClient,
    event: ConsumedEvent | undefined,
  ): Promise<void> {
    if (!event) {
      return;
    }
    const existing = await tx.processedEvent.findUnique({
      where: { eventId: event.eventId },
    });
    if (existing) {
      if (
        existing.eventType !== event.eventType ||
        existing.payloadHash !== event.payloadHash
      ) {
        throw new EventReplayConflictError(event.eventId);
      }
      return;
    }
    await tx.processedEvent.create({ data: event });
  }

  private async serializable<T>(
    context: TransactionContext,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
    retryUniqueConflict = false,
  ): Promise<T> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
      try {
        const result = await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5_000,
          timeout: 10_000,
        });
        this.metrics.recordOperation(
          context.operation,
          this.isReplayedResult(result) ? 'replayed' : 'success',
        );
        return result;
      } catch (error) {
        const retryCause = this.retryCause(error, retryUniqueConflict);
        if (retryCause && attempt < this.maxRetries) {
          this.metrics.recordRetry(context.operation, retryCause);
          this.logger.warn(
            {
              operation: context.operation,
              correlationId: context.correlationId,
              attempt,
              maxAttempts: this.maxRetries,
              retryCause,
              prismaCode: this.prismaErrorCode(error),
              postgresCode: this.postgresErrorCode(error),
            },
            'Retrying serializable credit transaction',
          );
          continue;
        }

        const finalError = retryCause ? new ConcurrentOperationError() : error;
        const failureCause = this.failureCause(finalError);
        this.metrics.recordFailure(context.operation, failureCause);
        this.metrics.recordOperation(context.operation, failureCause);
        if (
          finalError instanceof CreditDomainError &&
          finalError.statusCode === 409
        ) {
          this.metrics.recordConflict(
            context.operation,
            finalError.code.toLowerCase(),
          );
        }
        if (retryCause) {
          this.logger.error(
            {
              operation: context.operation,
              correlationId: context.correlationId,
              attempts: this.maxRetries,
              retryCause,
              prismaCode: this.prismaErrorCode(error),
              postgresCode: this.postgresErrorCode(error),
            },
            'Credit transaction retries exhausted',
          );
        }
        throw finalError;
      }
    }
    throw new ConcurrentOperationError();
  }

  private retryCause(
    error: unknown,
    retryUniqueConflict: boolean,
  ): RetryCause | undefined {
    if (this.isSerializationConflict(error)) {
      return 'serialization';
    }
    if (
      retryUniqueConflict &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return 'unique_conflict';
    }
    return undefined;
  }

  private failureCause(error: unknown): string {
    return error instanceof CreditDomainError
      ? error.code.toLowerCase()
      : 'unexpected_failure';
  }

  private isReplayedResult(value: unknown): boolean {
    return (
      typeof value === 'object' &&
      value !== null &&
      'replayed' in value &&
      value.replayed === true
    );
  }

  private prismaErrorCode(error: unknown): string | undefined {
    return error instanceof Prisma.PrismaClientKnownRequestError
      ? error.code
      : undefined;
  }

  private postgresErrorCode(error: unknown): string | undefined {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return undefined;
    }
    const meta = error.meta as
      | {
          driverAdapterError?: {
            cause?: { originalCode?: string };
          };
        }
      | undefined;
    return meta?.driverAdapterError?.cause?.originalCode;
  }

  private isSerializationConflict(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return false;
    }
    if (error.code === 'P2034') {
      return true;
    }
    if (error.code !== 'P2010') {
      return false;
    }

    const originalCode = this.postgresErrorCode(error);
    return originalCode === '40001' || originalCode === '40P01';
  }

  private toBalance(account: DbAccount): CreditBalance {
    return {
      userId: account.userId,
      availableCredits: account.availableCredits,
      reservedCredits: account.reservedCredits,
      version: account.version,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }

  private toReservation(reservation: DbReservation): CreditReservation {
    return {
      ...reservation,
      status: reservation.status,
    };
  }
}
