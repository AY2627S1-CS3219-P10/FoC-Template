import type { ConfigService } from '@nestjs/config';
import { ConcurrentOperationError } from '../../src/domain/credit.errors';
import { Prisma } from '../../src/generated/prisma/client';
import { CreditMetricsService } from '../../src/infrastructure/credit-metrics.service';
import { PrismaCreditRepository } from '../../src/infrastructure/prisma-credit.repository';
import type { PrismaService } from '../../src/infrastructure/prisma.service';

const serializationConflict = () =>
  new Prisma.PrismaClientKnownRequestError('serialization conflict', {
    code: 'P2034',
    clientVersion: '7.10.0',
  });

describe('PrismaCreditRepository transaction retry observability', () => {
  const account = {
    userId: '10000000-0000-4000-8000-000000000001',
    availableCredits: 100,
    reservedCredits: 0,
    version: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  const repositoryWith = (transaction: jest.Mock) => {
    const metrics = new CreditMetricsService();
    const prisma = { $transaction: transaction } as unknown as PrismaService;
    const config = {
      getOrThrow: jest.fn().mockReturnValue(2),
    } as unknown as ConfigService;
    const repository = new PrismaCreditRepository(prisma, metrics, config);
    const logger = { warn: jest.fn(), error: jest.fn() };
    Object.assign(repository, { logger });
    return { repository, metrics, logger };
  };

  it('logs and counts a retry before succeeding', async () => {
    const transaction = jest
      .fn()
      .mockRejectedValueOnce(serializationConflict())
      .mockImplementationOnce(
        async (operation: (tx: unknown) => Promise<unknown>) =>
          operation({
            creditAccount: { findUnique: jest.fn().mockResolvedValue(account) },
          }),
      );
    const { repository, metrics, logger } = repositoryWith(transaction);

    await expect(
      repository.initializeAccount(account.userId, 100, 'retry-correlation'),
    ).resolves.toMatchObject({ replayed: true });
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'initialize',
        correlationId: 'retry-correlation',
        attempt: 1,
        retryCause: 'serialization',
      }),
      'Retrying serializable credit transaction',
    );
    expect(metrics.render()).toContain(
      'credit_transaction_retries_total{operation="initialize",cause="serialization"} 1',
    );
  });

  it('logs and counts exhausted serialization retries', async () => {
    const transaction = jest
      .fn()
      .mockRejectedValue(serializationConflict());
    const { repository, metrics, logger } = repositoryWith(transaction);

    await expect(
      repository.initializeAccount(account.userId, 100, 'failed-correlation'),
    ).rejects.toBeInstanceOf(ConcurrentOperationError);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'initialize',
        correlationId: 'failed-correlation',
        attempts: 2,
      }),
      'Credit transaction retries exhausted',
    );
    expect(metrics.render()).toContain(
      'credit_transaction_failures_total{operation="initialize",cause="concurrent_operation"} 1',
    );
  });
});
