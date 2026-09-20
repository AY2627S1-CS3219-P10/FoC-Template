export type ReservationStatus = 'RESERVED' | 'SETTLED' | 'RELEASED';

export interface CreditBalance {
  userId: string;
  availableCredits: number;
  reservedCredits: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreditReservation {
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
