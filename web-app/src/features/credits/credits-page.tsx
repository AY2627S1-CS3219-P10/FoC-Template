"use client";

import Link from "next/link";
import { useAuth } from "@/features/auth/auth-provider";
import { Icon } from "@/components/icon";
import { CreditBalanceCard } from "./credit-balance";

export function CreditsPage() {
  const { user, loading, error, reload } = useAuth();
  if (loading) return <div className="empty-state" role="status">Loading your account…</div>;
  if (error) return (
    <div className="empty-state">
      <h1>Unable to load your account</h1><p role="alert">{error}</p>
      <button className="button button-dark" onClick={() => void reload()}>Try again</button>
    </div>
  );
  if (!user) return (
    <div className="empty-state">
      <h1>Your credits</h1><p>Log in to view your credit balance.</p>
      <Link className="button button-dark" href="/login">Log in</Link>
    </div>
  );
  return (
    <section className="credits-page">
      <p className="eyebrow">YOUR CAMPUS WALLET</p>
      <h1><Icon name="coin" /> Credits</h1>
      <p className="page-description">A little help goes a long way. Keep track of the credits you can use for campus errands.</p>
      <CreditBalanceCard />
      <div className="credits-guide">
        <h2>How your credits work</h2>
        <p>Available credits are ready to use. When you request an errand, its bounty is reserved until the errand is completed or cancelled.</p>
        <p>Complete errands for other students to earn credits. Cancelled reservations return to your available balance.</p>
      </div>
      <Link className="button button-light" href="/account">Back to your account</Link>
    </section>
  );
}
