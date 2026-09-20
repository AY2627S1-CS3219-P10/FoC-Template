import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LedgerEntryType,
  Prisma,
  ReservationStatus,
} from '../generated/prisma/client';
import type {
  CreditRepository,
  ReserveCreditsCommand,
} from '../application/credit.repository';
import {
  AccountNotFoundError,
  ConcurrentOperationError,
  InsufficientCreditsError,
  InvariantViolationError,
  ReservationNotFoundError,
} from '../domain/credit.errors';
import {
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

type DbAccount = {
  userId: string;
  availableCredits: number;
  reservedCredits: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

type DbReservation = {
  id: string;
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

@Injectable()
export class PrismaCreditRepository implements CreditRepository {
  private readonly maxRetries: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.maxRetries = config.getOrThrow<number>('credit.transactionRetries');
  }

  async initializeAccount(
    userId: string,
    initialCredits: number,
  ): Promise<OperationResult<CreditBalance>> {
    return this.serializable(async (tx) => {
      const existing = await tx.creditAccount.findUnique({ where: { userId } });
      if (existing) {
        return { data: this.toBalance(existing), replayed: true };
      }

      const account = await tx.creditAccount.create({
        data: { userId, availableCredits: initialCredits },
      });
      if (initialCredits > 0) {
        await tx.creditLedgerEntry.create({
          data: {
            accountUserId: userId,
            type: LedgerEntryType.INITIAL_CREDIT,
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
    return this.serializable(async (tx) => {
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
        data: command,
      });
      await tx.creditLedgerEntry.create({
        data: {
          accountUserId: command.requesterId,
          reservationId: reservation.id,
          type: LedgerEntryType.RESERVATION,
          amount: command.amount,
          availableBalanceAfter: account.availableCredits,
          reservedBalanceAfter: account.reservedCredits,
          referenceKey: `errand:${command.errandId}:reserve`,
        },
      });

      return {
        data: {
          reservation: this.toReservation(reservation),
          requesterBalance: this.toBalance(account),
        },
        replayed: false,
      };
    }, true);
  }

  async settle(
    errandId: string,
    courierId: string,
  ): Promise<OperationResult<SettlementResult>> {
    return this.serializable(async (tx) => {
      await this.lockReservation(tx, errandId);
      const existing = await tx.creditReservation.findUnique({
        where: { errandId },
      });
      if (!existing) {
        throw new ReservationNotFoundError(errandId);
      }

      const current = this.toReservation(existing);
      if (assertSettlementCanReplay(current, courierId)) {
        return {
          data: {
            reservation: current,
            requesterBalance: await this.requireAccount(
              tx,
              current.requesterId,
            ),
            courierBalance: await this.requireAccount(tx, courierId),
          },
          replayed: true,
        };
      }

      await this.requireAccount(tx, courierId);
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
          { errandId, requesterId: current.requesterId },
        );
      }

      const requesterAfterDebit = await tx.creditAccount.findUniqueOrThrow({
        where: { userId: current.requesterId },
      });
      const courier = await tx.creditAccount.update({
        where: { userId: courierId },
        data: {
          availableCredits: { increment: current.amount },
          version: { increment: 1 },
        },
      });
      const reservation = await tx.creditReservation.update({
        where: { errandId },
        data: {
          status: ReservationStatus.SETTLED,
          courierId,
          settledAt: new Date(),
        },
      });

      await tx.creditLedgerEntry.createMany({
        data: [
          {
            accountUserId: current.requesterId,
            reservationId: current.id,
            type: LedgerEntryType.TRANSFER_DEBIT,
            amount: current.amount,
            availableBalanceAfter: requesterAfterDebit.availableCredits,
            reservedBalanceAfter: requesterAfterDebit.reservedCredits,
            referenceKey: `errand:${errandId}:settle:requester`,
          },
          {
            accountUserId: courierId,
            reservationId: current.id,
            type: LedgerEntryType.TRANSFER_CREDIT,
            amount: current.amount,
            availableBalanceAfter: courier.availableCredits,
            reservedBalanceAfter: courier.reservedCredits,
            referenceKey: `errand:${errandId}:settle:courier`,
          },
        ],
      });

      const requester =
        courierId === current.requesterId
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
    });
  }

  async release(
    errandId: string,
  ): Promise<OperationResult<ReservationResult>> {
    return this.serializable(async (tx) => {
      await this.lockReservation(tx, errandId);
      const existing = await tx.creditReservation.findUnique({
        where: { errandId },
      });
      if (!existing) {
        throw new ReservationNotFoundError(errandId);
      }

      const current = this.toReservation(existing);
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
          { errandId, requesterId: current.requesterId },
        );
      }

      const account = await tx.creditAccount.findUniqueOrThrow({
        where: { userId: current.requesterId },
      });
      const reservation = await tx.creditReservation.update({
        where: { errandId },
        data: {
          status: ReservationStatus.RELEASED,
          releasedAt: new Date(),
        },
      });
      await tx.creditLedgerEntry.create({
        data: {
          accountUserId: current.requesterId,
          reservationId: current.id,
          type: LedgerEntryType.RELEASE,
          amount: current.amount,
          availableBalanceAfter: account.availableCredits,
          reservedBalanceAfter: account.reservedCredits,
          referenceKey: `errand:${errandId}:release`,
        },
      });

      return {
        data: {
          reservation: this.toReservation(reservation),
          requesterBalance: this.toBalance(account),
        },
        replayed: false,
      };
    });
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
      SELECT "id"
      FROM "credit_reservations"
      WHERE "errand_id" = ${errandId}::uuid
      FOR UPDATE
    `;
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

  private async serializable<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
    retryUniqueConflict = false,
  ): Promise<T> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5_000,
          timeout: 10_000,
        });
      } catch (error) {
        const retryable =
          this.isSerializationConflict(error) ||
          (retryUniqueConflict &&
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002');
        if (!retryable || attempt === this.maxRetries) {
          if (retryable) {
            throw new ConcurrentOperationError();
          }
          throw error;
        }
      }
    }
    throw new ConcurrentOperationError();
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

    const meta = error.meta as
      | {
          driverAdapterError?: {
            cause?: { originalCode?: string };
          };
        }
      | undefined;
    return meta?.driverAdapterError?.cause?.originalCode === '40001';
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
