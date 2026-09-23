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
