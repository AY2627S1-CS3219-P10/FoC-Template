import type {
  CreditBalance,
  CreditTransactionHistory,
  OperationResult,
  ReservationResult,
  SettlementResult,
} from '../domain/credit.types';

export const CREDIT_REPOSITORY = Symbol('CREDIT_REPOSITORY');

export interface ConsumedEvent {
  eventId: string;
  eventType: string;
  payloadHash: string;
}

export interface ReserveCreditsCommand {
  errandId: string;
  requesterId: string;
  amount: number;
  correlationId: string;
}

export interface AdjustReservationCommand {
  errandId: string;
  requesterId: string;
  targetAmount: number;
  idempotencyKey: string;
  correlationId: string;
}

export interface SettleCreditsCommand {
  errandId: string;
  requesterId: string;
  courierId: string;
  amount: number;
  correlationId: string;
  consumedEvent?: ConsumedEvent;
}

export interface ReleaseCreditsCommand {
  errandId: string;
  requesterId: string;
  amount: number;
  correlationId: string;
}

export interface CreditRepository {
  initializeAccount(
    userId: string,
    initialCredits: number,
    correlationId: string,
    consumedEvent?: ConsumedEvent,
  ): Promise<OperationResult<CreditBalance>>;
  getBalance(userId: string): Promise<CreditBalance>;
  getTransactionHistory(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<CreditTransactionHistory>;
  reserve(
    command: ReserveCreditsCommand,
  ): Promise<OperationResult<ReservationResult>>;
  adjust(
    command: AdjustReservationCommand,
  ): Promise<OperationResult<ReservationResult>>;
  settle(
    command: SettleCreditsCommand,
  ): Promise<OperationResult<SettlementResult>>;
  release(
    command: ReleaseCreditsCommand,
  ): Promise<OperationResult<ReservationResult>>;
  isReady(): Promise<boolean>;
}
