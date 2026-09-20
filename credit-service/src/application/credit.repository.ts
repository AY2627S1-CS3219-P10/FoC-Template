import type {
  CreditBalance,
  OperationResult,
  ReservationResult,
  SettlementResult,
} from '../domain/credit.types';

export const CREDIT_REPOSITORY = Symbol('CREDIT_REPOSITORY');

export interface ReserveCreditsCommand {
  errandId: string;
  requesterId: string;
  amount: number;
}

export interface CreditRepository {
  initializeAccount(
    userId: string,
    initialCredits: number,
  ): Promise<OperationResult<CreditBalance>>;
  getBalance(userId: string): Promise<CreditBalance>;
  reserve(
    command: ReserveCreditsCommand,
  ): Promise<OperationResult<ReservationResult>>;
  settle(
    errandId: string,
    courierId: string,
  ): Promise<OperationResult<SettlementResult>>;
  release(errandId: string): Promise<OperationResult<ReservationResult>>;
  isReady(): Promise<boolean>;
}
