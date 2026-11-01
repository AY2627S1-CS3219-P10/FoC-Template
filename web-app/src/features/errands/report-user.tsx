"use client";

import { useRef, useState } from "react";
import { authenticatedRequest } from "@/services/api";
import type { UserReport } from "@/services/contracts";

export interface ReportTarget {
  id: string;
  username: string;
  role: "requester" | "courier";
}

export function ReportUser({ targets }: { targets: ReportTarget[] }) {
  const [target, setTarget] = useState<ReportTarget | null>(null);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const locked = useRef(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target || locked.current) return;
    const issue = description.trim();
    if (!issue || issue.length > 500) {
      setError("Describe the issue in 1 to 500 characters.");
      return;
    }
    locked.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await authenticatedRequest<UserReport>("reports", {
        reportedUserId: target.id,
        description: issue,
      });
      setNotice(`Your report about ${target.username} was submitted.`);
      setTarget(null);
      setDescription("");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The report could not be submitted. Please try again.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  if (!targets.length) return null;
  return (
    <section className="report-user" aria-label="Report an errand participant">
      <h2>Report a participant</h2>
      <p>Reports are reviewed by campus administrators.</p>
      {!target && (
        <div className="errand-action-buttons">
          {targets.map((candidate) => (
            <button
              key={candidate.id}
              className="button button-outline"
              disabled={busy}
              onClick={() => {
                setTarget(candidate);
                setError("");
                setNotice("");
              }}
            >
              Report {candidate.role}
            </button>
          ))}
        </div>
      )}
      {target && (
        <form className="account-form report-user-form" onSubmit={submit}>
          <h3>Report {target.username}</h3>
          <p>
            You are reporting the {target.role}, <strong>{target.username}</strong>.
          </p>
          <label>
            What happened?
            <textarea
              name="description"
              required
              minLength={1}
              maxLength={500}
              value={description}
              disabled={busy}
              onChange={(event) => setDescription(event.target.value)}
            />
            <small>{description.length}/500 characters</small>
          </label>
          <div className="errand-action-buttons">
            <button className="button button-delete" disabled={busy}>
              {busy ? "Submitting report…" : `Submit report about ${target.username}`}
            </button>
            <button
              type="button"
              className="button button-light"
              disabled={busy}
              onClick={() => {
                setTarget(null);
                setDescription("");
                setError("");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {notice && <p className="form-success" role="status">{notice}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  );
}
