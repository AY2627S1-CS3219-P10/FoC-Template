/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of my courier rating rendering and interaction code (MyCourierRating).
 * Author review: Validated MyCourierRating state updates, click handlers, request results in web-app/my-courier-rating.tsx; refined JSX layout and user-facing wording. Additional review item: Check loading and error states, and displayed values after successful actions.
 */

"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { authenticatedRequest } from "@/services/api";
import type { CourierReviewOverview } from "@/services/contracts";

export function MyCourierRating() {
  const { user, loading } = useAuth();
  if (loading || !user) return null;
  return <MyCourierRatingContent key={user.id} />;
}

function MyCourierRatingContent() {
  const [data, setData] = useState<CourierReviewOverview | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    authenticatedRequest<CourierReviewOverview>("couriers/me/review-overview")
      .then((value) => {
        if (active) {
          setData(value);
          setError("");
        }
      })
      .catch((failure) => {
        if (active)
          setError(
            failure instanceof Error
              ? failure.message
              : "Unable to load your courier reviews.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  return (
    <section
      className="home-rating-panel"
      aria-labelledby="my-courier-rating-title"
    >
      <div className="home-rating-overview">
        <p className="eyebrow">YOUR COMMUNITY IMPACT</p>
        <h2 id="my-courier-rating-title">Your courier rating</h2>
        <p>Feedback from the people you’ve helped.</p>
        {data && !error && (
          <>
            <p className="home-rating-score">
              <span aria-hidden="true">★</span>{" "}
              {data.averageStars === null
                ? "—"
                : data.averageStars.toLocaleString("en-SG", {
                    maximumFractionDigits: 1,
                  })}
              <span className="home-rating-scale"> / 5</span>
            </p>
            <p>
              {data.reviewCount === 0
                ? "No ratings yet"
                : `Based on ${data.reviewCount} ${data.reviewCount === 1 ? "review" : "reviews"}`}
            </p>
          </>
        )}
      </div>
      <div className="home-rating-comments">
        <h3>Latest comments</h3>
        {loading ? (
          <p role="status">Loading your reviews…</p>
        ) : error ? (
          <>
            <p role="alert">{error}</p>
            <button
              className="button button-light"
              onClick={() => {
                setLoading(true);
                setAttempt((value) => value + 1);
              }}
            >
              Retry your reviews
            </button>
          </>
        ) : data?.recentComments.length ? (
          <ol className="home-rating-comment-list">
            {data.recentComments.map((review) => (
              <li key={review.id}>
                <div className="home-rating-comment-meta">
                  <span>{review.stars} / 5 stars</span>
                  <time dateTime={review.createdAt}>
                    {new Date(review.createdAt).toLocaleDateString("en-SG", {
                      timeZone: "Asia/Singapore",
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </time>
                </div>
                <blockquote>{review.comment}</blockquote>
              </li>
            ))}
          </ol>
        ) : (
          <p className="home-rating-empty">
            {data?.reviewCount
              ? "You have ratings, but no written comments yet."
              : "Once you complete deliveries, requesters can leave you a rating and a comment."}
          </p>
        )}
      </div>
    </section>
  );
}
