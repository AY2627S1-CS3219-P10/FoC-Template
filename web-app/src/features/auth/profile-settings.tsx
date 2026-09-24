"use client";

import { useState } from "react";
import { useAuth } from "./auth-provider";

export function ProfileSettings({
  phoneNumber,
  onPasswordChanged,
}: {
  phoneNumber: string;
  onPasswordChanged: () => void;
}) {
  const { updatePhoneNumber, changePassword } = useAuth();
  const [busy, setBusy] = useState<"phone" | "password" | null>(null);
  const [phoneError, setPhoneError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [notice, setNotice] = useState("");
  async function savePhone(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy("phone");
    setPhoneError("");
    setNotice("");
    try {
      await updatePhoneNumber(String(data.get("phoneNumber")));
      setNotice("Phone number updated.");
    } catch (error) {
      setPhoneError(
        error instanceof Error
          ? error.message
          : "Unable to update phone number.",
      );
    } finally {
      setBusy(null);
    }
  }
  async function savePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get("newPassword"));
    setPasswordError("");
    if (password !== data.get("confirmPassword")) {
      setPasswordError("New passwords do not match.");
      return;
    }
    if (
      password.length < 8 ||
      !/[A-Z]/.test(password) ||
      !/[a-z]/.test(password) ||
      !/[^A-Za-z0-9\s]/.test(password)
    ) {
      setPasswordError(
        "Use at least 8 characters, including an uppercase letter, a lowercase letter, and a special character.",
      );
      return;
    }
    setBusy("password");
    try {
      await changePassword(String(data.get("currentPassword")), password);
      form.reset();
      onPasswordChanged();
    } catch (error) {
      setPasswordError(
        error instanceof Error ? error.message : "Unable to change password.",
      );
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="profile-settings">
      <section
        className="profile-settings-card"
        aria-labelledby="phone-heading"
      >
        <h2 id="phone-heading">Change phone number</h2>
        <form className="account-form" onSubmit={savePhone}>
          <label>
            New phone number
            <input
              key={phoneNumber}
              name="phoneNumber"
              type="tel"
              autoComplete="tel"
              inputMode="numeric"
              required
              pattern="[0-9]{8,15}"
              minLength={8}
              maxLength={15}
              defaultValue={phoneNumber}
              disabled={busy !== null}
              aria-describedby="phone-help"
            />
          </label>
          <small id="phone-help">
            Enter 8–15 digits, without spaces or a plus sign.
          </small>
          {phoneError && (
            <p className="form-error" role="alert">
              {phoneError}
            </p>
          )}
          {notice && (
            <p className="form-success" role="status">
              {notice}
            </p>
          )}
          <button className="button button-dark" disabled={busy !== null}>
            {busy === "phone" ? "Saving…" : "Save phone number"}
          </button>
        </form>
      </section>
      <section
        className="profile-settings-card"
        aria-labelledby="password-heading"
      >
        <h2 id="password-heading">Change password</h2>
        <p>Changing your password signs you out of all sessions.</p>
        <form className="account-form" onSubmit={savePassword}>
          <label>
            Current password
            <input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              disabled={busy !== null}
            />
          </label>
          <label>
            New password
            <input
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              disabled={busy !== null}
              aria-describedby="password-help"
            />
          </label>
          <small id="password-help">
            At least 8 characters, with uppercase and lowercase letters and a
            special character.
          </small>
          <label>
            Confirm new password
            <input
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              disabled={busy !== null}
            />
          </label>
          {passwordError && (
            <p className="form-error" role="alert">
              {passwordError}
            </p>
          )}
          <button className="button button-dark" disabled={busy !== null}>
            {busy === "password" ? "Changing password…" : "Change password"}
          </button>
        </form>
      </section>
    </div>
  );
}
