"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ErrandStatus } from "@/features/errands/errand-status";
import { authenticatedRequest } from "@/services/api";
import type { Errand, ErrandOperation } from "@/services/contracts";

type Outcome = "REFUND_REQUESTER" | "PAY_COURIER";
const formatDate = (value: string) =>
  new Date(value).toLocaleString("en-SG", { timeZone: "Asia/Singapore" });
const participant = (username: string | null | undefined) =>
  username?.trim() || "Unavailable user";

export function DisputedErrands() {
  const lock = useRef(false);
  const [errands, setErrands] = useState<Errand[]>([]);
  const [filter, setFilter] = useState<"OPEN" | "RESOLVED">("OPEN");
  const [selected, setSelected] = useState<Errand | null>(null);
  const [confirmation, setConfirmation] = useState<Outcome | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setSelected(null);
    setConfirmation(null);
    setPending(null);
    try {
      setErrands(
        await authenticatedRequest<Errand[]>("admin/disputed-errands"),
      );
    } catch (failure) {
      setErrands([]);
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to load disputed errands.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  async function viewDetails(id: string) {
    if (detailLoading) return;
    setDetailLoading(true);
    setError("");
    setNotice("");
    try {
      setSelected(await authenticatedRequest<Errand>(`errands/${id}`));
      setConfirmation(null);
      setPending(null);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to load the errand details.",
      );
    } finally {
      setDetailLoading(false);
    }
  }

  async function resolve(outcome?: Outcome) {
    if (!selected || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = pending
        ? await authenticatedRequest<ErrandOperation>(
            `errand-operations/${pending}`,
          )
        : await authenticatedRequest<ErrandOperation>(
            `errands/${selected.id}/resolve-dispute`,
            { outcome, idempotencyKey: crypto.randomUUID() },
          );
      if (result.status === "PENDING") {
        setPending(result.operationId);
        setNotice(
          "The credit operation is still processing. The dispute remains open.",
        );
      } else if (result.status === "FAILED") {
        setPending(null);
        setError(
          "The financial resolution failed. The dispute remains open and may be retried.",
        );
      } else if (result.errand) {
        const next = {
          ...result.errand,
          requesterUsername: selected.requesterUsername,
          courierUsername: selected.courierUsername,
        };
        setSelected(next);
        setErrands((current) =>
          current.map((item) => (item.id === next.id ? next : item)),
        );
        setPending(null);
        setConfirmation(null);
        setNotice(
          next.dispute?.outcome === "REFUND_REQUESTER"
            ? "Final decision recorded. The reserved credits were refunded to the requester."
            : "Final decision recorded. The reserved credits were paid to the courier.",
        );
      }
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to resolve this dispute.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const visible = errands.filter(
    (errand) =>
      (filter === "OPEN" && errand.status === "DISPUTED") ||
      (filter === "RESOLVED" && errand.status === "RESOLVED"),
  );
  const statementsReady = Boolean(
    selected?.dispute?.requesterStatement &&
      selected.dispute.courierStatement &&
      selected.dispute.status === "OPEN",
  );

  return (
    <section>
      <div className="admin-heading">
        <div>
          <h2>Disputed errands</h2>
          <p>Review both statements and make one final credit decision.</p>
        </div>
        <button
          className="button button-outline"
          disabled={loading || detailLoading || busy}
          onClick={() => void load()}
        >
          Refresh disputes
        </button>
      </div>
      <div className="admin-tabs" aria-label="Dispute status filters">
        {(["OPEN", "RESOLVED"] as const).map((status) => (
          <button
            key={status}
            className={`button ${filter === status ? "button-dark" : "button-outline"}`}
            aria-pressed={filter === status}
            onClick={() => setFilter(status)}
          >
            {status === "OPEN" ? "Open disputes" : "Resolved disputes"}
          </button>
        ))}
      </div>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {selected && (
        <section
          className="admin-card moderation-detail disputed-errand-detail"
          aria-label="Disputed errand details"
        >
          <div>
            <p className="eyebrow">{selected.dispute?.status ?? "OPEN"} DISPUTE</p>
            <h3>{selected.description}</h3>
            <dl className="moderation-fields">
              <div><dt>Errand ID</dt><dd>{selected.id}</dd></div>
              <div><dt>Status</dt><dd><ErrandStatus status={selected.status} /></dd></div>
              <div><dt>Requester</dt><dd>{participant(selected.requesterUsername)}</dd></div>
              <div><dt>Courier</dt><dd>{participant(selected.courierUsername)}</dd></div>
              <div><dt>Pickup</dt><dd>{selected.pickupSupplierName} · {selected.pickupLocationLabel}</dd></div>
              <div><dt>Deliver to</dt><dd>{selected.deliveryDestination}</dd></div>
              <div><dt>Offered credits</dt><dd>{selected.offeredCredits.toLocaleString()} credits</dd></div>
              <div><dt>Item type</dt><dd>{selected.itemType === "FOOD" ? "Food" : "Non-perishable"}</dd></div>
              <div className="admin-span"><dt>Instructions</dt><dd>{selected.instructions}</dd></div>
              <div><dt>Created</dt><dd>{formatDate(selected.createdAt)}</dd></div>
              {selected.acceptedAt && <div><dt>Accepted</dt><dd>{formatDate(selected.acceptedAt)}</dd></div>}
              {selected.pickedUpAt && <div><dt>Picked up</dt><dd>{formatDate(selected.pickedUpAt)}</dd></div>}
              {selected.deliveredAt && <div><dt>Delivered</dt><dd>{formatDate(selected.deliveredAt)}</dd></div>}
              <div><dt>Disputed</dt><dd>{selected.disputedAt ? formatDate(selected.disputedAt) : "Unavailable"}</dd></div>
              <div><dt>Last updated</dt><dd>{formatDate(selected.updatedAt)}</dd></div>
              <div className="admin-span"><dt>Requester&apos;s explanation</dt><dd>{selected.dispute?.requesterStatement ?? "Unavailable"}</dd></div>
              <div><dt>Requester submitted</dt><dd>{selected.dispute?.requesterSubmittedAt ? formatDate(selected.dispute.requesterSubmittedAt) : "Unavailable"}</dd></div>
              <div className="admin-span"><dt>Courier&apos;s response</dt><dd>{selected.dispute?.courierStatement ?? "Awaiting the courier's response."}</dd></div>
              <div><dt>Courier submitted</dt><dd>{selected.dispute?.courierSubmittedAt ? formatDate(selected.dispute.courierSubmittedAt) : "Not submitted"}</dd></div>
              {selected.dispute?.outcome && <div><dt>Final outcome</dt><dd>{selected.dispute.outcome === "REFUND_REQUESTER" ? "Requester refunded" : "Courier paid"}</dd></div>}
              {selected.dispute?.resolvedAt && <div><dt>Resolved</dt><dd>{formatDate(selected.dispute.resolvedAt)}</dd></div>}
              {selected.dispute?.resolvedBy && <div><dt>Resolved by</dt><dd>{selected.dispute.resolvedBy}</dd></div>}
            </dl>
            {selected.dispute?.status === "OPEN" && !statementsReady && (
              <p className="dispute-resolution-note">
                Resolution is unavailable until the assigned courier submits a response.
              </p>
            )}
            {statementsReady && !confirmation && !pending && (
              <div className="errand-action-buttons">
                <button className="button button-delete" disabled={busy} onClick={() => setConfirmation("REFUND_REQUESTER")}>Refund requester</button>
                <button className="button button-edit" disabled={busy} onClick={() => setConfirmation("PAY_COURIER")}>Pay courier</button>
              </div>
            )}
            {confirmation && (
              <div className="errand-delete-confirm">
                <h4>Confirm final decision</h4>
                <p>
                  {confirmation === "REFUND_REQUESTER"
                    ? `Return ${selected.offeredCredits.toLocaleString()} reserved credits to ${participant(selected.requesterUsername)}?`
                    : `Transfer ${selected.offeredCredits.toLocaleString()} reserved credits to ${participant(selected.courierUsername)}?`}
                  {" "}This decision cannot be changed.
                </p>
                <button className={confirmation === "REFUND_REQUESTER" ? "button button-delete" : "button button-edit"} disabled={busy} onClick={() => void resolve(confirmation)}>
                  {busy ? "Resolving…" : confirmation === "REFUND_REQUESTER" ? "Confirm requester refund" : "Confirm courier payment"}
                </button>
                <button className="button button-light" disabled={busy} onClick={() => setConfirmation(null)}>Go back</button>
              </div>
            )}
            {pending && (
              <button className="button button-dark" disabled={busy} onClick={() => void resolve()}>
                {busy ? "Checking…" : "Check resolution status"}
              </button>
            )}
            <button className="button button-outline" disabled={detailLoading || busy} onClick={() => setSelected(null)}>Close details</button>
          </div>
        </section>
      )}
      {loading ? (
        <p role="status">Loading disputed errands…</p>
      ) : visible.length === 0 ? (
        <p>{filter === "OPEN" ? "No open disputes." : "No resolved disputes."}</p>
      ) : (
        <div className="admin-list">
          {visible.map((errand) => (
            <article className="admin-card admin-heading disputed-errand-card" key={errand.id}>
              <div>
                <div className="disputed-errand-heading"><h3>{errand.description}</h3><ErrandStatus status={errand.status} /></div>
                <p><strong>Errand ID:</strong> {errand.id}</p>
                <p><strong>Requester:</strong> {participant(errand.requesterUsername)} · <strong>Courier:</strong> {participant(errand.courierUsername)}</p>
                <p><strong>Pickup:</strong> {errand.pickupSupplierName} · {errand.pickupLocationLabel}</p>
                <p><strong>Deliver to:</strong> {errand.deliveryDestination}</p>
                <p><strong>Offered credits:</strong> {errand.offeredCredits.toLocaleString()}</p>
                <p><strong>Disputed:</strong> {errand.disputedAt ? formatDate(errand.disputedAt) : "Timestamp unavailable"}</p>
              </div>
              <button className="button button-outline" disabled={detailLoading || busy} onClick={() => void viewDetails(errand.id)}>
                {detailLoading ? "Loading details…" : "View details"}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
