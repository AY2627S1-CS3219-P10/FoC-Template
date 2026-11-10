/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of error rendering and interaction code (ErrorPage).
 * Author review: Validated ErrorPage click handlers, error rendering in web-app/error.tsx; refined JSX layout and user-facing wording.
 */

"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty-state">
      <h1>Something went wrong.</h1>
      <p>Let’s give that another try.</p>
      <button className="button button-dark" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
