import {
  ACTOR_ROLES,
  ERRAND_STATUSES,
  LIFECYCLE_ACTIONS,
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
};
const actorsByAction: Record<string, string[]> = {
  accept: ['COURIER'],
  pickup: ['COURIER'],
  deliver: ['COURIER'],
  confirm: ['REQUESTER'],
  dispute: ['REQUESTER'],
  'auto-complete': ['SYSTEM'],
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
    expect(matrix).toHaveLength(9 * 6 * 4));

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

  it('reports the error codes the API returns', () => {
    expect(() => transition('OPEN', 'accept', 'REQUESTER')).toThrow(
      expect.objectContaining({ code: 'ERRAND_ACTION_FORBIDDEN' }),
    );
    expect(() => transition('ACCEPTED', 'accept', 'COURIER')).toThrow(
      expect.objectContaining({ code: 'ERRAND_INVALID_TRANSITION' }),
    );
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
