/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of credit types code (ReservationStatus, CreditLedgerEntryType, CreditTransaction).
 * Author review: Validated ReservationStatus, CreditLedgerEntryType existing type members and constant values in credit-service/credit.types.ts; edited naming and formatting for readability.
 */

export type ReservationStatus = 'RESERVED' | 'SETTLED' | 'RELEASED';

export type CreditLedgerEntryType =
  | 'INITIALIZE'
  | 'RESERVE'
  | 'ADJUST_RESERVE'
  | 'ADJUST_RELEASE'
  | 'SETTLE'
  | 'RELEASE';

export interface CreditTransaction {
  ledgerEntryId: string;
  userId: string;
  reservationId: string | null;
  errandId: string | null;
  type: CreditLedgerEntryType;
  amount: number;
  availableBalanceAfter: number;
  reservedBalanceAfter: number;
  correlationId: string;
  createdAt: Date;
}

export interface CreditTransactionHistory {
  items: CreditTransaction[];
  page: {
    limit: number;
    offset: number;
    nextOffset: number | null;
  };
}

export interface CreditBalance {
  userId: string;
  availableCredits: number;
  reservedCredits: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreditReservation {
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
}

export interface OperationResult<T> {
  data: T;
  replayed: boolean;
}

export interface ReservationResult {
  reservation: CreditReservation;
  requesterBalance: CreditBalance;
}

export interface SettlementResult extends ReservationResult {
  courierBalance: CreditBalance;
}
