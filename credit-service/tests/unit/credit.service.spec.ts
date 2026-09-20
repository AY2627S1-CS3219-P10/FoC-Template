import type { ConfigService } from '@nestjs/config';
import type { CreditRepository } from '../../src/application/credit.repository';
import { CreditService } from '../../src/application/credit.service';
import type {
  CreditBalance,
  CreditReservation,
  OperationResult,
  ReservationResult,
  SettlementResult,
} from '../../src/domain/credit.types';

const now = new Date('2026-01-01T00:00:00Z');
const balance: CreditBalance = {
  userId: '10000000-0000-4000-8000-000000000001',
  availableCredits: 100,
  reservedCredits: 0,
  version: 0,
  createdAt: now,
  updatedAt: now,
};
const reservation: CreditReservation = {
  id: '20000000-0000-4000-8000-000000000001',
  errandId: '30000000-0000-4000-8000-000000000001',
  requesterId: balance.userId,
  courierId: null,
  amount: 20,
  status: 'RESERVED',
  createdAt: now,
  updatedAt: now,
  settledAt: null,
  releasedAt: null,
};

describe('CreditService', () => {
  let repository: jest.Mocked<CreditRepository>;
  let service: CreditService;

  beforeEach(() => {
    repository = {
      initializeAccount: jest.fn(),
      getBalance: jest.fn(),
      reserve: jest.fn(),
      settle: jest.fn(),
      release: jest.fn(),
      isReady: jest.fn(),
    };
    const config = {
      getOrThrow: jest.fn().mockReturnValue(100),
    } as unknown as ConfigService;
    service = new CreditService(repository, config);
  });

  it('initializes with the configured starting balance', async () => {
    const expected: OperationResult<CreditBalance> = {
      data: balance,
      replayed: false,
    };
    repository.initializeAccount.mockResolvedValue(expected);
    await expect(service.initializeAccount(balance.userId)).resolves.toBe(expected);
    expect(repository.initializeAccount).toHaveBeenCalledWith(balance.userId, 100);
  });

  it('delegates balance lookup', async () => {
    repository.getBalance.mockResolvedValue(balance);
    await expect(service.getBalance(balance.userId)).resolves.toBe(balance);
  });

  it('delegates reservation', async () => {
    const command = {
      errandId: reservation.errandId,
      requesterId: reservation.requesterId,
      amount: reservation.amount,
    };
    const expected: OperationResult<ReservationResult> = {
      data: { reservation, requesterBalance: balance },
      replayed: false,
    };
    repository.reserve.mockResolvedValue(expected);
    await expect(service.reserve(command)).resolves.toBe(expected);
    expect(repository.reserve).toHaveBeenCalledWith(command);
  });

  it('delegates settlement', async () => {
    const courierId = '40000000-0000-4000-8000-000000000001';
    const expected: OperationResult<SettlementResult> = {
      data: {
        reservation: { ...reservation, status: 'SETTLED', courierId },
        requesterBalance: balance,
        courierBalance: { ...balance, userId: courierId },
      },
      replayed: false,
    };
    repository.settle.mockResolvedValue(expected);
    await expect(service.settle(reservation.errandId, courierId)).resolves.toBe(
      expected,
    );
    expect(repository.settle).toHaveBeenCalledWith(reservation.errandId, courierId);
  });

  it('delegates release', async () => {
    const expected: OperationResult<ReservationResult> = {
      data: {
        reservation: { ...reservation, status: 'RELEASED' },
        requesterBalance: balance,
      },
      replayed: false,
    };
    repository.release.mockResolvedValue(expected);
    await expect(service.release(reservation.errandId)).resolves.toBe(expected);
  });

  it('delegates readiness', async () => {
    repository.isReady.mockResolvedValue(true);
    await expect(service.isReady()).resolves.toBe(true);
  });
});
