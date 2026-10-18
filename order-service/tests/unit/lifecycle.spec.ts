import {
  ACTOR_ROLES,
  ERRAND_STATUSES,
  LIFECYCLE_ACTIONS,
  TRANSITIONS,
  alreadyApplied,
  transition,
} from '../../src/domain/lifecycle';
import { OrderError } from '../../src/domain/errand';
import {
  ActorRole,
  CompletionMethod,
  ErrandStatus,
} from '../../src/generated/prisma/enums';

// Written out independently of TRANSITIONS so the table cannot silently drift.
const allowed: Record<string, string> = {
  'OPEN accept COURIER': 'ACCEPTED',
  'ACCEPTED pickup COURIER': 'PICKED_UP',
  'PICKED_UP deliver COURIER': 'DELIVERED',
  'PICKED_UP confirm REQUESTER': 'COMPLETED',
  'DELIVERED confirm REQUESTER': 'COMPLETED',
  'DELIVERED dispute REQUESTER': 'DISPUTED',
  'DELIVERED auto-complete SYSTEM': 'COMPLETED',
  'OPEN cancel REQUESTER': 'CANCELLED',
  'ACCEPTED cancel REQUESTER': 'CANCELLED',
  'ACCEPTED courier-cancel COURIER': 'OPEN',
  'ACCEPTED reopen SYSTEM': 'OPEN',
  'OPEN expire SYSTEM': 'EXPIRED',
};
const actorsByAction: Record<string, string[]> = {
  accept: ['COURIER'],
  pickup: ['COURIER'],
  deliver: ['COURIER'],
  confirm: ['REQUESTER'],
  dispute: ['REQUESTER'],
  'auto-complete': ['SYSTEM'],
  cancel: ['REQUESTER'],
  'courier-cancel': ['COURIER'],
  reopen: ['SYSTEM'],
  expire: ['SYSTEM'],
};
const matrix = ERRAND_STATUSES.flatMap((from) =>
  LIFECYCLE_ACTIONS.flatMap((action) =>
    ACTOR_ROLES.map((actor) => [from, action, actor] as const),
  ),
);

function outcome(...args: Parameters<typeof transition>) {
  try {
    return transition(...args).to;
  } catch (error) {
    if (error instanceof OrderError) return error.status;
    throw error;
  }
}

describe('lifecycle transition table (requirements.md §3)', () => {
  it('covers every status × action × actor', () =>
    expect(matrix).toHaveLength(8 * 10 * 4));

  it.each(matrix)('%s + %s by %s', (from, action, actor) => {
    const expected =
      allowed[`${from} ${action} ${actor}`] ??
      (actorsByAction[action].includes(actor) ? 409 : 403);
    expect(outcome(from, action, actor)).toBe(expected);
  });

  it('stamps the target timestamp and records how an errand completed (D-008)', () => {
    expect(transition('OPEN', 'accept', 'COURIER').stamp).toBe('acceptedAt');
    expect(transition('ACCEPTED', 'pickup', 'COURIER').stamp).toBe(
      'pickedUpAt',
    );
    expect(transition('PICKED_UP', 'deliver', 'COURIER').stamp).toBe(
      'deliveredAt',
    );
    const dispute = transition('DELIVERED', 'dispute', 'REQUESTER');
    expect(dispute.stamp).toBe('disputedAt');
    expect(dispute.completionMethod).toBeUndefined();
    expect(transition('PICKED_UP', 'confirm', 'REQUESTER')).toMatchObject({
      stamp: 'completedAt',
      completionMethod: 'REQUESTER_CONFIRMED',
    });
    expect(transition('DELIVERED', 'auto-complete', 'SYSTEM')).toMatchObject({
      stamp: 'completedAt',
      completionMethod: 'AUTO_TIMEOUT',
    });
  });

  it('releases credits only through the journal rows, and the courier only before pickup', () => {
    const flagged = (
      flag: 'releasesCredits' | 'releasesCourier' | 'excludesCourier',
    ) =>
      TRANSITIONS.filter((row) => row[flag])
        .map((row) => `${row.from} ${row.action} ${row.actor}`)
        .sort();
    expect(flagged('releasesCredits')).toEqual([
      'ACCEPTED cancel REQUESTER',
      'OPEN cancel REQUESTER',
      'OPEN expire SYSTEM',
    ]);
    expect(flagged('releasesCourier')).toEqual([
      'ACCEPTED cancel REQUESTER',
      'ACCEPTED courier-cancel COURIER',
      'ACCEPTED reopen SYSTEM',
    ]);
    expect(flagged('excludesCourier')).toEqual([
      'ACCEPTED courier-cancel COURIER',
      'ACCEPTED reopen SYSTEM',
    ]);
    expect(transition('OPEN', 'expire', 'SYSTEM').stamp).toBe('expiredAt');
    expect(transition('ACCEPTED', 'cancel', 'REQUESTER').stamp).toBe(
      'cancelledAt',
    );
    expect(transition('ACCEPTED', 'reopen', 'SYSTEM').stamp).toBeUndefined();
  });

  it('keeps DISPUTED a dead end and forbids every cancel after pickup (D-015, D-020, Q-020)', () => {
    for (const from of ['PICKED_UP', 'DELIVERED', 'DISPUTED'] as const) {
      expect(outcome(from, 'cancel', 'REQUESTER')).toBe(409);
      expect(outcome(from, 'courier-cancel', 'COURIER')).toBe(409);
    }
    expect(TRANSITIONS.filter((row) => row.from === 'DISPUTED')).toEqual([]);
  });

  it('reports the error codes the API returns', () => {
    expect(() => transition('OPEN', 'accept', 'REQUESTER')).toThrow(
      expect.objectContaining({ code: 'ERRAND_ACTION_FORBIDDEN' }),
    );
    expect(() => transition('ACCEPTED', 'accept', 'COURIER')).toThrow(
      expect.objectContaining({ code: 'ERRAND_INVALID_TRANSITION' }),
    );
  });

  it('recognises a repeated action only in its own target state and role', () => {
    expect(alreadyApplied('PICKED_UP', 'pickup', 'COURIER')).toBe(true);
    expect(alreadyApplied('COMPLETED', 'confirm', 'REQUESTER')).toBe(true);
    expect(alreadyApplied('DELIVERED', 'pickup', 'COURIER')).toBe(false);
    expect(alreadyApplied('PICKED_UP', 'pickup', 'REQUESTER')).toBe(false);
    expect(alreadyApplied('ACCEPTED', 'accept', 'COURIER')).toBe(true);
    expect(alreadyApplied('CANCELLED', 'cancel', 'REQUESTER')).toBe(true);
  });

  it('matches the Postgres enums in prisma/schema.prisma', () => {
    expect([...ERRAND_STATUSES].sort()).toEqual(
      Object.values(ErrandStatus).sort(),
    );
    expect([...ACTOR_ROLES].sort()).toEqual(Object.values(ActorRole).sort());
    expect(Object.values(CompletionMethod).sort()).toEqual([
      'AUTO_TIMEOUT',
      'REQUESTER_CONFIRMED',
    ]);
  });
});
