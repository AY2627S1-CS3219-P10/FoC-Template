/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of courier review rendering and interaction code (CourierReviews, CourierReviewForm).
 * Author review: Validated CourierReviews, CourierReviewForm state updates, form submission, click handlers in web-app/courier-review.tsx; refined JSX layout and user-facing wording. Additional review item: Check invalid-input messages and repeated submissions.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, authenticatedRequest } from "@/services/api";
import type { CourierRatingSummary, CourierReview } from "@/services/contracts";

export function CourierReviews({
  errandId,
  courierId,
  canReview,
  canReadReview = false,
}: {
  errandId: string;
  courierId: string;
  canReview: boolean;
  canReadReview?: boolean;
}) {
  const [revision, setRevision] = useState(0);
  return (
    <section className="courier-reviews" aria-label="Courier reviews">
      <CourierRating key={`${courierId}:${revision}`} courierId={courierId} />
      {(canReview || canReadReview) && (
        <CourierReviewForm
          key={`${errandId}:${canReview}`}
          errandId={errandId}
          readOnly={!canReview}
          onSubmitted={() => setRevision((value) => value + 1)}
        />
      )}
    </section>
  );
}

function CourierRating({ courierId }: { courierId: string }) {
  const [summary, setSummary] = useState<CourierRatingSummary | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    authenticatedRequest<CourierRatingSummary>(
      `couriers/${courierId}/rating-summary`,
    )
      .then((value) => {
        if (active) {
          setSummary(value);
          setError("");
        }
      })
      .catch((failure) => {
        if (active)
          setError(
            failure instanceof Error
              ? failure.message
              : "Unable to load courier rating.",
          );
      });
    return () => {
      active = false;
    };
  }, [courierId, attempt]);
  return (
    <div>
      <h2>Courier rating</h2>
      {error ? (
        <>
          <p role="alert">{error}</p>
          <button
            className="button button-light"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry rating
          </button>
        </>
      ) : !summary ? (
        <p role="status">Loading courier rating…</p>
      ) : (
        <p>
          {summary.reviewCount === 0 || summary.averageStars === null
            ? "No reviews yet"
            : `${summary.averageStars.toLocaleString("en-SG", { maximumFractionDigits: 1 })} / 5 · ${summary.reviewCount} ${summary.reviewCount === 1 ? "review" : "reviews"}`}
        </p>
      )}
    </div>
  );
}

export function CourierReviewForm({
  errandId,
  onSubmitted,
  readOnly = false,
}: {
  errandId: string;
  onSubmitted: () => void;
  readOnly?: boolean;
}) {
  const [review, setReview] = useState<CourierReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [stars, setStars] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);

  useEffect(() => {
    let active = true;
    authenticatedRequest<{ review: CourierReview | null }>(
      `errands/${errandId}/review`,
    )
      .then((value) => {
        if (active) {
          setReview(value.review);
          setLoadError("");
          setLoading(false);
        }
      })
      .catch((failure) => {
        if (active) {
          setLoadError(
            failure instanceof Error
              ? failure.message
              : "Unable to load your review.",
          );
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [errandId, attempt]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly || locked.current || review) return;
    if (stars === null) {
      setError("Choose a rating from 1 to 5 stars.");
      return;
    }
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const saved = await authenticatedRequest<CourierReview>(
        `errands/${errandId}/review`,
        { stars, comment: comment.trim() },
      );
      setReview(saved);
      onSubmitted();
    } catch (failure) {
      if (
        failure instanceof ApiError &&
        failure.code === "REVIEW_ALREADY_EXISTS"
      ) {
        setError("You have already reviewed this errand.");
        try {
          const saved = await authenticatedRequest<{
            review: CourierReview | null;
          }>(`errands/${errandId}/review`);
          if (saved.review) {
            setReview(saved.review);
            onSubmitted();
          }
        } catch {
          /* Keep the entered values and let the user retry. */
        }
      } else if (
        failure instanceof ApiError &&
        failure.code === "ERRAND_NOT_REVIEWABLE"
      ) {
        setError("You can review this delivery after completion.");
      } else if (
        failure instanceof ApiError &&
        failure.code === "REVIEW_REQUESTER_REQUIRED"
      ) {
        setError("Only the requester can review this delivery.");
      } else
        setError(
          failure instanceof Error
            ? failure.message
            : "Unable to submit your review. Please try again.",
        );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  if (loading) return <p role="status">Loading delivery review…</p>;
  if (loadError)
    return (
      <div>
        <p role="alert">{loadError}</p>
        <button
          className="button button-light"
          onClick={() => {
            setLoading(true);
            setAttempt((value) => value + 1);
          }}
        >
          Retry review
        </button>
      </div>
    );
  if (review)
    return (
      <div className="saved-courier-review">
        <h3>{readOnly ? "Requester’s review" : "Your review"}</h3>
        {!readOnly && <p role="status">Your review has been submitted.</p>}
        <p>{review.stars} / 5 stars</p>
        {review.comment ? (
          <p className="review-comment">{review.comment}</p>
        ) : (
          <p>No written comment provided.</p>
        )}
      </div>
    );
  if (readOnly) return <p>The requester has not reviewed this delivery yet.</p>;
  return (
    <form className="account-form" onSubmit={submit}>
      <h3>Review this delivery</h3>
      <p>
        How was your experience with the courier? Reviews cannot be edited after
        submission.
      </p>
      <fieldset disabled={busy} className="review-stars">
        <legend>Rating</legend>
        {[1, 2, 3, 4, 5].map((value) => (
          <label key={value}>
            <input
              type="radio"
              name="review-stars"
              value={value}
              checked={stars === value}
              onChange={() => setStars(value)}
              required
            />
            {value} {value === 1 ? "star" : "stars"}
          </label>
        ))}
      </fieldset>
      <label>
        Comment (optional)
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={1000}
          disabled={busy}
        />
      </label>
      <p>{comment.length} / 1000 characters</p>
      {error && <p role="alert">{error}</p>}
      <button className="button button-dark" type="submit" disabled={busy}>
        {busy ? "Submitting review…" : "Submit review"}
      </button>
    </form>
  );
}
