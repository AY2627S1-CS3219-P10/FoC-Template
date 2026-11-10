// AI-assisted portions: courier review guidance (OpenAI Codex, GPT-6.1). Human review confirmed by the team, 2026-11-10. See /ai/usage-log.md.
import { OrderError, type ErrandRecord } from './errand';

export const MAX_REVIEW_COMMENT_LENGTH = 1000;

// checks permission and delivery state
export function assertReviewable(errand: ErrandRecord, actorId: string): void {
  if (errand.deletedAt) {
    throw new OrderError('ERRAND_NOT_FOUND', 'Errand not found.', 404);
  }
  if (errand.requesterId !== actorId) {
    throw new OrderError(
      'REVIEW_REQUESTER_REQUIRED',
      'Only the requester can review this delivery.',
      403,
    );
  }
  if (errand.status != 'COMPLETED' || !errand.courierId) {
    throw new OrderError(
      'ERRAND_NOT_REVIEWABLE',
      'Only completed errands with an assigned courier may be reviewed.',
      409,
    );
  }
}

//validates the score and turns a blank comment into null, throws error if invalid
export function normaliseReview(
  stars: number,
  comment?: string,
): { stars: number; comment: string | null } {
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    throw new OrderError(
      'INVALID_REVIEW_STARS',
      'Review stars must be an integer between 1 and 5.',
      400,
    );
  }
  const normalisedComment = comment?.trim() || null;
  if (
    normalisedComment &&
    normalisedComment.length > MAX_REVIEW_COMMENT_LENGTH
  ) {
    throw new OrderError(
      'INVALID_REVIEW_COMMENT',
      `Review comment must be at most ${MAX_REVIEW_COMMENT_LENGTH} characters long.`,
      400,
    );
  }
  return { stars, comment: normalisedComment };
}
