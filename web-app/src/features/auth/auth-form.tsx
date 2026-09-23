"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "./auth-provider";
import { ApiError, request } from "@/services/api";

type Mode = "login" | "register" | "verify";
const headings = {
  login: "Welcome back, neighbour.",
  register: "Your campus community awaits.",
  verify: "Check your NUS inbox.",
};

export function AuthForm({ mode }: { mode: Mode }) {
  const auth = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [inactive, setInactive] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError("");
    setNotice("");
    setInactive(false);
    try {
      if (mode === "login") {
        await auth.login(email.trim(), String(data.get("password")));
        router.replace("/suppliers");
      } else if (mode === "register") {
        await request("auth/register", {
          email: email.trim(),
          username: data.get("username"),
          phoneNumber: data.get("phoneNumber"),
          password: data.get("password"),
        });
        form.reset();
        router.push("/verify-email");
      } else {
        await request("auth/verify", {
          email: email.trim(),
          code: data.get("code"),
        });
        setVerified(true);
      }
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to complete the request.",
      );
      setInactive(
        failure instanceof ApiError && failure.code === "ACCOUNT_NOT_ACTIVE",
      );
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!email.trim()) {
      setError("Enter your NUS email address first.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request("auth/resend", { email: email.trim() });
      setNotice(
        "If your account is awaiting verification, a new code will be emailed to you.",
      );
      setCooldown(60);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to resend the code.",
      );
      if (failure instanceof ApiError && failure.status === 429)
        setCooldown(failure.retryAfter || 60);
    } finally {
      setBusy(false);
    }
  }

  if (verified)
    return (
      <section className="auth-page">
        <div className="auth-card">
          <p className="eyebrow">YOU’RE ALL SET</p>
          <h1>Email verified.</h1>
          <p>
            Your account is ready. Log in to discover suppliers around campus.
          </p>
          <Link href="/login" className="button button-dark">
            Continue to login
          </Link>
        </div>
      </section>
    );
  if (auth.user)
    return (
      <section className="auth-page">
        <div className="auth-card">
          <h1>You’re logged in.</h1>
          <p>Welcome, {auth.user.username}.</p>
          <Link href="/suppliers" className="button button-dark">
            Browse suppliers
          </Link>
        </div>
      </section>
    );

  return (
    <section className="auth-page">
      <div className="auth-intro">
        <p className="eyebrow">FRIEND ON CAMPUS</p>
        <h2>
          A little connection.
          <br />
          <em>A better campus day.</em>
        </h2>
        <p>Discover your campus favourites and find the right pickup spot.</p>
      </div>
      <div className="auth-card">
        <p className="eyebrow">
          {mode === "login"
            ? "LOG IN"
            : mode === "register"
              ? "JOIN THE COMMUNITY"
              : "VERIFY YOUR EMAIL"}
        </p>
        <h1>{headings[mode]}</h1>
        <p>
          {mode === "verify"
            ? "Enter the six-digit code from your verification email. Codes expire after 10 minutes."
            : mode === "register"
              ? "Create an account with your @u.nus.edu email. We’ll send you a verification code."
              : "Log in with your verified NUS account."}
        </p>
        <form onSubmit={submit} className="account-form">
          {mode === "register" && (
            <label>
              Username
              <input
                name="username"
                autoComplete="username"
                pattern="[A-Za-z0-9]+"
                title="Letters and numbers only"
                required
              />
            </label>
          )}
          <label>
            NUS email
            <input
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@u.nus.edu"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          {mode === "register" && (
            <label>
              Phone number
              <input
                name="phoneNumber"
                type="tel"
                autoComplete="tel"
                pattern="[0-9]{8,15}"
                title="8 to 15 digits"
                required
              />
            </label>
          )}
          {mode !== "verify" && (
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                minLength={mode === "register" ? 8 : undefined}
                required
                aria-describedby={
                  mode === "register" ? "password-help" : undefined
                }
              />
              {mode === "register" && (
                <small id="password-help">
                  At least 8 characters, with uppercase, lowercase, and a
                  special character.
                </small>
              )}
            </label>
          )}
          {mode === "verify" && (
            <label>
              Verification code
              <input
                name="code"
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
              />
            </label>
          )}
          {error && (
            <div role="alert" className="form-error">
              {error}
              {inactive && (
                <p>
                  If you haven’t verified your email,{" "}
                  <Link href="/verify-email">verify it here</Link>. For a
                  suspended or banned account, contact your administrator.
                </p>
              )}
            </div>
          )}
          {notice && (
            <p role="status" className="form-success">
              {notice}
            </p>
          )}
          <button
            className="button button-dark"
            disabled={busy || auth.loading}
          >
            {busy
              ? "Please wait…"
              : mode === "login"
                ? "Log in"
                : mode === "register"
                  ? "Create account"
                  : "Verify email"}
          </button>
          {mode === "verify" && (
            <button
              type="button"
              className="button button-outline"
              disabled={busy || cooldown > 0}
              onClick={resend}
            >
              {cooldown ? `Resend in ${cooldown}s` : "Resend verification code"}
            </button>
          )}
        </form>
        <p className="auth-links">
          {mode === "login" ? (
            <>
              New here? <Link href="/register">Create an account</Link>
              <br />
              <Link href="/verify-email">Verify your email</Link>
            </>
          ) : (
            <>
              Already verified? <Link href="/login">Log in</Link>
            </>
          )}
        </p>
      </div>
    </section>
  );
}
