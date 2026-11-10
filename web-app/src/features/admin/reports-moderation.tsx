/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of reports moderation rendering and interaction code (calculateSuspensionExpiry, ReportsModeration).
 * Author review: Validated calculateSuspensionExpiry, ReportsModeration state updates, form submission, click handlers in web-app/reports-moderation.tsx; refined JSX layout and user-facing wording. Additional review item: Check invalid-input messages and repeated submissions.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authenticatedRequest } from "@/services/api";
import type { SuspensionResult, UserReport } from "@/services/contracts";

type Duration = "1" | "3" | "7" | "30" | "custom";

export function calculateSuspensionExpiry(
  duration: Duration,
  customValue: string,
  now = new Date(),
): string | null {
  const expiry =
    duration === "custom"
      ? new Date(customValue)
      : new Date(now.getTime() + Number(duration) * 24 * 60 * 60 * 1000);
  return Number.isFinite(expiry.getTime()) && expiry > now
    ? expiry.toISOString()
    : null;
}

const formatDate = (value: string) =>
  new Date(value).toLocaleString("en-SG", { timeZone: "Asia/Singapore" });
const errorMessage = (failure: unknown) =>
  failure instanceof Error
    ? failure.message
    : "Unable to complete the moderation action.";

export function ReportsModeration({ administratorId }: { administratorId: string }) {
  const [status, setStatus] = useState<"OPEN" | "RESOLVED">("OPEN");
  const [reports, setReports] = useState<UserReport[]>([]);
  const [selected, setSelected] = useState<UserReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showSuspension, setShowSuspension] = useState(false);
  const [duration, setDuration] = useState<Duration>("1");
  const [customExpiry, setCustomExpiry] = useState("");
  const [suspension, setSuspension] = useState<SuspensionResult | null>(null);
  const locked = useRef(false);

  const load = useCallback(async (filter: "OPEN" | "RESOLVED") => {
    setLoading(true);
    setError("");
    setSelected(null);
    setShowSuspension(false);
    try {
      setReports(
        await authenticatedRequest<UserReport[]>(
          `admin/reports?status=${filter}`,
        ),
      );
    } catch (failure) {
      setReports([]);
      setError(errorMessage(failure));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => load(status));
  }, [load, status]);

  async function view(reportId: string) {
    if (locked.current) return;
    setBusy(true);
    setError("");
    setNotice("");
    setSuspension(null);
    try {
      setSelected(
        await authenticatedRequest<UserReport>(`admin/reports/${reportId}`),
      );
      setShowSuspension(false);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  async function resolve() {
    if (!selected || locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const updated = await authenticatedRequest<UserReport>(
        `admin/reports/${selected.id}/resolve`,
        {},
        "PATCH",
      );
      setSelected(updated);
      setReports((current) => current.filter((report) => report.id !== updated.id));
      setNotice(`Report about ${updated.reportedUser.username} was marked resolved.`);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  async function suspend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || locked.current) return;
    const suspendedUntil = calculateSuspensionExpiry(duration, customExpiry);
    if (!suspendedUntil) {
      setError("Choose a valid suspension expiry in the future.");
      return;
    }
    locked.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await authenticatedRequest<SuspensionResult>(
        `admin/accounts/${selected.reportedUser.id}/suspension`,
        { suspendedUntil },
        "PATCH",
      );
      setSuspension(result);
      setShowSuspension(false);
      setNotice(
        `${result.username} is suspended until ${formatDate(result.suspendedUntil)}. The report remains open until you resolve it.`,
      );
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  return (
    <section>
      <h2>Reports & moderation</h2>
      <p>Review reports, temporarily suspend accounts, and resolve reports separately.</p>
      <div className="admin-category-filters category-filters" aria-label="Filter reports by status">
        {(["OPEN", "RESOLVED"] as const).map((filter) => (
          <button
            key={filter}
            className={`button ${status === filter ? "button-dark" : "button-outline"}`}
            aria-pressed={status === filter}
            disabled={busy}
            onClick={() => setStatus(filter)}
          >
            {filter === "OPEN" ? "Open" : "Resolved"}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="admin-error">{error}</p>}
      {notice && <p role="status" className="admin-notice">{notice}</p>}
      {selected && (
        <section className="admin-card moderation-detail" aria-label="Report details">
          <div>
            <p className="eyebrow">{selected.status} REPORT</p>
            <h3>Report about {selected.reportedUser.username}</h3>
            <dl className="moderation-fields">
              <div><dt>Reporter</dt><dd>{selected.reporter.username}</dd></div>
              <div><dt>Reported user</dt><dd>{selected.reportedUser.username}</dd></div>
              <div><dt>Submitted</dt><dd>{formatDate(selected.createdAt)}</dd></div>
              <div><dt>Status</dt><dd>{selected.status}</dd></div>
              <div className="admin-span"><dt>Issue description</dt><dd>{selected.description}</dd></div>
              {selected.resolvedAt && <div><dt>Resolved</dt><dd>{formatDate(selected.resolvedAt)}</dd></div>}
            </dl>
            {suspension?.id === selected.reportedUser.id && (
              <p><strong>Suspended until:</strong> {formatDate(suspension.suspendedUntil)}</p>
            )}
            <div className="admin-actions">
              {selected.status === "OPEN" && (
                <>
                  <button
                    className="button admin-danger"
                    disabled={busy || selected.reportedUser.id === administratorId}
                    onClick={() => setShowSuspension(true)}
                  >
                    Suspend user
                  </button>
                  <button className="button button-dark" disabled={busy} onClick={() => void resolve()}>
                    {busy ? "Updating…" : "Mark report resolved"}
                  </button>
                </>
              )}
              <button className="button button-outline" disabled={busy} onClick={() => setSelected(null)}>Close details</button>
            </div>
            {selected.reportedUser.id === administratorId && <p>You cannot suspend your own account.</p>}
          </div>
        </section>
      )}
      {selected && showSuspension && (
        <form className="admin-confirm admin-form" aria-label="Confirm suspension" onSubmit={suspend}>
          <h3>Temporarily suspend {selected.reportedUser.username}</h3>
          <p>This revokes the user’s sessions. It does not resolve this report.</p>
          <fieldset disabled={busy}>
            <label>
              Suspension duration
              <select value={duration} onChange={(event) => setDuration(event.target.value as Duration)}>
                <option value="1">1 day</option>
                <option value="3">3 days</option>
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="custom">Custom expiry</option>
              </select>
            </label>
            {duration === "custom" && (
              <label>
                Custom expiry date and time
                <input
                  type="datetime-local"
                  required
                  value={customExpiry}
                  onChange={(event) => setCustomExpiry(event.target.value)}
                />
                <small>The selected local time will be sent with its timezone as an ISO 8601 timestamp.</small>
              </label>
            )}
          </fieldset>
          <div className="admin-actions">
            <button className="button admin-danger" disabled={busy}>
              {busy ? "Suspending…" : `Confirm suspension of ${selected.reportedUser.username}`}
            </button>
            <button type="button" className="button button-outline" disabled={busy} onClick={() => setShowSuspension(false)}>Cancel</button>
          </div>
        </form>
      )}
      {loading ? (
        <p role="status">Loading {status.toLowerCase()} reports…</p>
      ) : reports.length === 0 ? (
        <p>No {status.toLowerCase()} reports.</p>
      ) : (
        <div className="admin-list">
          {reports.map((report) => (
            <article className="admin-card admin-heading moderation-report" key={report.id}>
              <div>
                <h3>{report.reportedUser.username}</h3>
                <p>Reported by {report.reporter.username} · {formatDate(report.createdAt)}</p>
                <p>{report.description}</p>
                <p><strong>Status:</strong> {report.status}</p>
              </div>
              <button className="button button-outline" disabled={busy} onClick={() => void view(report.id)}>View report</button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
