"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";

export function SiteHeader() {
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function handleLogout() {
    setBusy(true);
    setError("");
    try {
      await logout();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Logout failed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand" aria-label="Friend on Campus home">
          <span className="brand-mark">
            f<span>o</span>c<span className="brand-dot">.</span>
          </span>
          <span className="brand-name">friend on campus</span>
        </Link>
        <nav aria-label="Main navigation">
          {user?.isAdmin && (
            <Link
              href="/admin"
              aria-current={pathname === "/admin" ? "page" : undefined}
            >
              Admin dashboard
            </Link>
          )}
          <Link href="/" aria-current={pathname === "/" ? "page" : undefined}>
            Home
          </Link>
          <Link
            href="/suppliers"
            aria-current={
              pathname.startsWith("/suppliers") ? "page" : undefined
            }
          >
            Suppliers
          </Link>
        </nav>
        <div className="header-account">
          {loading ? (
            <span role="status">Connecting…</span>
          ) : user ? (
            <>
              <Link
                href="/account"
                className="account-link"
                aria-label="Your account"
              >
                {user.username}
              </Link>
              <button
                className="logout-button"
                disabled={busy}
                onClick={handleLogout}
              >
                {busy ? "Logging out…" : "Log out"}
              </button>
            </>
          ) : (
            <Link href="/login" className="button button-dark">
              Log in
            </Link>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="header-error">
          {error}
        </p>
      )}
    </header>
  );
}
