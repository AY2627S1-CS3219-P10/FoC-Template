import { OrderError } from './errand';

/** Every value of the Postgres `ErrandStatus` enum (D-013). */
export const ERRAND_STATUSES = [
  'OPEN',
  'ACCEPTED',
  'PICKED_UP',
  'DELIVERED',
  'DISPUTED',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
] as const;
export type ErrandStatus = (typeof ERRAND_STATUSES)[number];

export const LIFECYCLE_ACTIONS = [
  'accept',
  'pickup',
  'deliver',
  'confirm',
  'dispute',
  'auto-complete',
  'cancel',
  'courier-cancel',
  'reopen',
  'expire',
] as const;
export type LifecycleAction = (typeof LIFECYCLE_ACTIONS)[number];

/** COURIER means the assigned courier, or for `accept` any user who is not the requester. */
export const ACTOR_ROLES = ['REQUESTER', 'COURIER', 'ADMIN', 'SYSTEM'] as const;
export type ActorRole = (typeof ACTOR_ROLES)[number];

/** D-008: a DELIVERED errand completes automatically this long after `deliveredAt`. */
export const AUTO_COMPLETE_AFTER_HOURS = 4;
/** D-017: an ACCEPTED errand not picked up this long after `acceptedAt` reopens. */
export const REOPEN_AFTER_MINUTES = 30;

export type CompletionMethod = 'REQUESTER_CONFIRMED' | 'AUTO_TIMEOUT';
export type LifecycleTimestamp =
  | 'acceptedAt'
  | 'pickedUpAt'
  | 'deliveredAt'
  | 'disputedAt'
  | 'completedAt'
  | 'cancelledAt'
  | 'expiredAt';

export interface Transition {
  from: ErrandStatus;
  action: LifecycleAction;
  actor: ActorRole;
  to: ErrandStatus;
  /** Column set to the transition time; none when the errand returns to OPEN. */
  stamp?: LifecycleTimestamp;
  completionMethod?: CompletionMethod;
  /** Clears `courierId`/`acceptedAt`: the courier can no longer act on the errand. */
  releasesCourier?: true;
  /** The released courier may never accept this errand again (D-016, D-017). */
  excludesCourier?: true;
  /**
   * Releases the reservation over HTTP, so the row runs through the ErrandOperation
   * journal instead of a single-statement transition (D-001, D-019).
   */
  releasesCredits?: true;
}

/**
 * Decided rows of docs/requirements.md §3 only. Courier cancel after pickup (Q-020) and
 * dispute resolution (Q-014) are parked, so DISPUTED has no way out.
 */
export const TRANSITIONS: readonly Transition[] = [
  // FR5, FR6
  {
    from: 'OPEN',
    action: 'accept',
    actor: 'COURIER',
    to: 'ACCEPTED',
    stamp: 'acceptedAt',
  },
  // FR7.1
  {
    from: 'ACCEPTED',
    action: 'pickup',
    actor: 'COURIER',
    to: 'PICKED_UP',
    stamp: 'pickedUpAt',
  },
  // D-005
  {
    from: 'PICKED_UP',
    action: 'deliver',
    actor: 'COURIER',
    to: 'DELIVERED',
    stamp: 'deliveredAt',
  },
  // D-006 (early confirm and confirm)
  {
    from: 'PICKED_UP',
    action: 'confirm',
    actor: 'REQUESTER',
    to: 'COMPLETED',
    stamp: 'completedAt',
    completionMethod: 'REQUESTER_CONFIRMED',
  },
  {
    from: 'DELIVERED',
    action: 'confirm',
    actor: 'REQUESTER',
    to: 'COMPLETED',
    stamp: 'completedAt',
    completionMethod: 'REQUESTER_CONFIRMED',
  },
  // D-007
  {
    from: 'DELIVERED',
    action: 'dispute',
    actor: 'REQUESTER',
    to: 'DISPUTED',
    stamp: 'disputedAt',
  },
  // D-008
  {
    from: 'DELIVERED',
    action: 'auto-complete',
    actor: 'SYSTEM',
    to: 'COMPLETED',
    stamp: 'completedAt',
    completionMethod: 'AUTO_TIMEOUT',
  },
  // D-014, D-015: the requester cancels before pickup; the whole reservation is released
  {
    from: 'OPEN',
    action: 'cancel',
    actor: 'REQUESTER',
    to: 'CANCELLED',
    stamp: 'cancelledAt',
    releasesCredits: true,
  },
  {
    from: 'ACCEPTED',
    action: 'cancel',
    actor: 'REQUESTER',
    to: 'CANCELLED',
    stamp: 'cancelledAt',
    releasesCredits: true,
    releasesCourier: true,
  },
  // D-016: the courier gives the errand back; credits stay reserved
  {
    from: 'ACCEPTED',
    action: 'courier-cancel',
    actor: 'COURIER',
    to: 'OPEN',
    releasesCourier: true,
    excludesCourier: true,
  },
  // D-017: not picked up within 30 minutes; same effect as a courier cancel
  {
    from: 'ACCEPTED',
    action: 'reopen',
    actor: 'SYSTEM',
    to: 'OPEN',
    releasesCourier: true,
    excludesCourier: true,
  },
  // D-013, D-017, D-019: nobody accepted before `expiresAt`
  {
    from: 'OPEN',
    action: 'expire',
    actor: 'SYSTEM',
    to: 'EXPIRED',
    stamp: 'expiredAt',
    releasesCredits: true,
  },
];

/**
 * Resolves (from, action, actor). An actor who may never perform the action gets 403
 * whatever the state; an allowed actor in the wrong state gets 409.
 */
export function transition(
  from: ErrandStatus,
  action: LifecycleAction,
  actor: ActorRole,
): Transition {
  const rows = TRANSITIONS.filter(
    (row) => row.action === action && row.actor === actor,
  );
  if (rows.length === 0)
    throw new OrderError(
      'ERRAND_ACTION_FORBIDDEN',
      `A ${actor.toLowerCase()} may not ${action} this errand.`,
      403,
    );
  const row = rows.find((candidate) => candidate.from === from);
  if (!row)
    throw new OrderError(
      'ERRAND_INVALID_TRANSITION',
      `Cannot ${action} an errand that is ${from}.`,
      409,
    );
  return row;
}

/**
 * True when `actor` repeats `action` on an errand already in that action's target
 * state, e.g. a retried pickup. Callers return the current state instead of 409.
 */
export function alreadyApplied(
  status: ErrandStatus,
  action: LifecycleAction,
  actor: ActorRole,
) {
  return TRANSITIONS.some(
    (row) => row.action === action && row.actor === actor && row.to === status,
  );
}
