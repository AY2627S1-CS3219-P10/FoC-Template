"use client";

import { useRef, useState } from "react";
import { authenticatedRequest } from "@/services/api";
import type { Errand } from "@/services/contracts";

const formatDate = (value: string) =>
  new Date(value).toLocaleString("en-SG", { timeZone: "Asia/Singapore" });

export function ErrandDispute({
  errand,
  userId,
  disabled,
  onUpdated,
  onBusy,
}: {
  errand: Errand;
  userId: string;
  disabled: boolean;
  onUpdated: (errand: Errand) => void;
  onBusy: (busy: boolean) => void;
}) {
  const lock = useRef(false);
  const [mode, setMode] = useState<"closed" | "form" | "confirm">("closed");
  const [explanation, setExplanation] = useState("");
  const [response, setResponse] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const owner = errand.requesterId === userId;
  const courier = errand.courierId === userId;
  const dispute = errand.dispute;

  function validate(value: string) {
    const statement = value.trim();
    if (!statement || statement.length > 2000) {
      setError("Your statement must contain 1 to 2000 characters.");
      return null;
    }
    return statement;
  }

  async function submit(kind: "dispute" | "respond-dispute", value: string) {
    const statement = validate(value);
    if (!statement || lock.current) return;
    lock.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await authenticatedRequest<Errand>(
        `errands/${errand.id}/${kind}`,
        kind === "dispute"
          ? { explanation: statement }
          : { response: statement },
      );
      onUpdated(next);
      setMode("closed");
      setExplanation("");
      setResponse("");
      setNotice(
        kind === "dispute"
          ? "Dispute submitted. The offered credits remain reserved."
          : "Your response has been finalized.",
      );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to submit the dispute statement.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
      onBusy(false);
    }
  }

  return (
    <section className="errand-dispute-panel" aria-label="Errand dispute">
      {dispute ? (
        <>
          <h2>Dispute statements</h2>
          <article className="dispute-statement">
            <h3>Requester&apos;s explanation</h3>
            <p>{dispute.requesterStatement}</p>
            <small>
              Submitted {formatDate(dispute.requesterSubmittedAt)}
            </small>
          </article>
          {dispute.courierStatement && dispute.courierSubmittedAt ? (
            <article className="dispute-statement">
              <h3>Courier&apos;s response</h3>
              <p>{dispute.courierStatement}</p>
              <small>Submitted {formatDate(dispute.courierSubmittedAt)}</small>
            </article>
          ) : courier && errand.status === "DISPUTED" ? (
            <form
              className="account-form"
              onSubmit={(event) => {
                event.preventDefault();
                void submit("respond-dispute", response);
              }}
            >
              <label>
                Your Response
                <textarea
                  required
                  maxLength={2000}
                  value={response}
                  onChange={(event) => setResponse(event.target.value)}
                />
              </label>
              <small>{response.length}/2000 characters</small>
              <button className="button button-edit" disabled={busy || disabled}>
                {busy ? "Submitting…" : "Submit final response"}
              </button>
            </form>
          ) : (
            <p>The courier has not submitted a response yet.</p>
          )}
          {dispute.status === "RESOLVED" && (
            <p className="dispute-outcome" role="status">
              Final decision: {dispute.outcome === "REFUND_REQUESTER"
                ? "credits refunded to the requester"
                : "credits paid to the courier"}
              {dispute.resolvedAt
                ? ` on ${formatDate(dispute.resolvedAt)}`
                : ""}.
            </p>
          )}
        </>
      ) : owner && errand.status === "DELIVERED" ? (
        mode === "closed" ? (
          <button
            className="button button-delete"
            disabled={busy || disabled}
            onClick={() => {
              setError("");
              setMode("form");
            }}
          >
            Dispute errand
          </button>
        ) : mode === "form" ? (
          <form
            className="account-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (validate(explanation)) setMode("confirm");
            }}
          >
            <label>
              Why are you disputing this delivery?
              <textarea
                required
                maxLength={2000}
                value={explanation}
                onChange={(event) => setExplanation(event.target.value)}
              />
            </label>
            <small>{explanation.length}/2000 characters</small>
            <button className="button button-delete" disabled={busy || disabled}>
              Review dispute
            </button>
            <button
              type="button"
              className="button button-light"
              disabled={busy || disabled}
              onClick={() => setMode("closed")}
            >
              Cancel
            </button>
          </form>
        ) : (
          <div className="errand-delete-confirm">
            <h3>Confirm dispute</h3>
            <p>{explanation.trim()}</p>
            <p>
              Submit this explanation? The delivery will become disputed and
              the offered credits will remain reserved.
            </p>
            <button
              className="button button-delete"
              disabled={busy || disabled}
              onClick={() => void submit("dispute", explanation)}
            >
              {busy ? "Submitting…" : "Confirm and submit dispute"}
            </button>
            <button
              className="button button-light"
              disabled={busy || disabled}
              onClick={() => setMode("form")}
            >
              Go back
            </button>
          </div>
        )
      ) : null}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
