/** Consumed by credit-service, which settles the reservation (D-001). */
export const ERRAND_COMPLETED_EVENT = 'errand.completed.v1';

/**
 * Exactly these keys: credit rejects any other key. `amount` is the reserved bounty;
 * how the errand completed stays on the errand row (D-008).
 */
export interface ErrandCompletedPayload {
  errandId: string;
  requesterId: string;
  courierId: string;
  amount: number;
}
