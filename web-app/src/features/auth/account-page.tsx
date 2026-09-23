"use client";
import Link from "next/link";
import { useAuth } from "./auth-provider";

export function AccountPage() {
  const { user, loading, error, reload } = useAuth();
  if (loading)
    return (
      <div className="empty-state" role="status">
        Loading your account…
      </div>
    );
  if (error)
    return (
      <div className="empty-state">
        <h1>Unable to load your account</h1>
        <p role="alert">{error}</p>
        <button className="button button-dark" onClick={() => void reload()}>
          Try again
        </button>
      </div>
    );
  if (!user)
    return (
      <div className="empty-state">
        <h1>Your campus account</h1>
        <p>Log in to view your profile.</p>
        <Link className="button button-dark" href="/login">
          Log in
        </Link>
      </div>
    );
  return (
    <section className="account-page">
      <p className="eyebrow">YOUR ACCOUNT</p>
      <h1>Hello, {user.username}.</h1>
      <p className="page-description">
        Your details, securely retrieved from your account.
      </p>
      <dl className="profile-details">
        <div>
          <dt>Username</dt>
          <dd>{user.username}</dd>
        </div>
        <div>
          <dt>NUS email</dt>
          <dd>{user.email}</dd>
        </div>
        <div>
          <dt>Phone number</dt>
          <dd>{user.phoneNumber}</dd>
        </div>
        <div>
          <dt>Account status</dt>
          <dd>{user.status}</dd>
        </div>
        <div>
          <dt>Role</dt>
          <dd>{user.isAdmin ? "Administrator" : "Student"}</dd>
        </div>
      </dl>
      <Link className="button button-dark" href="/suppliers">
        Explore suppliers
      </Link>
    </section>
  );
}
