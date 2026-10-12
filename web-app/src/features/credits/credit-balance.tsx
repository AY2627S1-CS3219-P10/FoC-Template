"use client";

import { useCredits } from "./credit-provider";

export function CreditBalanceCard() {
  const { balance, error, loading, refresh } = useCredits();

  return (
    <section id="credits" className="profile-settings-card credit-balance" aria-labelledby="credit-heading" aria-busy={loading}>
      <h2 id="credit-heading">Your credits</h2>
      <p>Available credits can be used for errands. Reserved credits are held for ongoing errands.</p>
      {loading && <p role="status">Loading your credits…</p>}
      {error && <p role="alert">{error}</p>}
      {balance && (
        <dl className="profile-details">
          <div><dt>Available credits</dt><dd>{balance.availableCredits.toLocaleString()}</dd></div>
          <div><dt>Reserved credits</dt><dd>{balance.reservedCredits.toLocaleString()}</dd></div>
        </dl>
      )}
      <button className="button button-dark" disabled={loading} onClick={refresh}>
        {error ? "Retry credits" : "Refresh credits"}
      </button>
    </section>
  );
}
