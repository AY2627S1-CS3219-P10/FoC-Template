"use client";

import { useCallback, useEffect, useState } from "react";
import { ErrandStatus } from "@/features/errands/errand-status";
import { authenticatedRequest } from "@/services/api";
import type { Errand } from "@/services/contracts";

const formatDate = (value: string) =>
  new Date(value).toLocaleString("en-SG", { timeZone: "Asia/Singapore" });

const participant = (username: string | null | undefined) =>
  username?.trim() || "Unavailable user";

export function DisputedErrands() {
  const [errands, setErrands] = useState<Errand[]>([]);
  const [selected, setSelected] = useState<Errand | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setSelected(null);
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
    try {
      setSelected(await authenticatedRequest<Errand>(`errands/${id}`));
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

  return (
    <section>
      <div className="admin-heading">
        <div>
          <h2>Disputed errands</h2>
          <p>
            Review errands challenged by requesters. Credits remain reserved
            while a dispute is unresolved.
          </p>
        </div>
        <button
          className="button button-outline"
          disabled={loading || detailLoading}
          onClick={() => void load()}
        >
          Refresh disputes
        </button>
      </div>
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {selected && (
        <section
          className="admin-card moderation-detail disputed-errand-detail"
          aria-label="Disputed errand details"
        >
          <div>
            <p className="eyebrow">DISPUTED ERRAND</p>
            <h3>{selected.description}</h3>
            <dl className="moderation-fields">
              <div>
                <dt>Errand ID</dt>
                <dd>{selected.id}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd><ErrandStatus status={selected.status} /></dd>
              </div>
              <div>
                <dt>Requester</dt>
                <dd>{participant(selected.requesterUsername)}</dd>
              </div>
              <div>
                <dt>Courier</dt>
                <dd>{participant(selected.courierUsername)}</dd>
              </div>
              <div>
                <dt>Pickup</dt>
                <dd>{selected.pickupSupplierName} · {selected.pickupLocationLabel}</dd>
              </div>
              <div>
                <dt>Deliver to</dt>
                <dd>{selected.deliveryDestination}</dd>
              </div>
              <div>
                <dt>Offered credits</dt>
                <dd>{selected.offeredCredits.toLocaleString()} credits</dd>
              </div>
              <div>
                <dt>Item type</dt>
                <dd>{selected.itemType === "FOOD" ? "Food" : "Non-perishable"}</dd>
              </div>
              <div className="admin-span">
                <dt>Instructions</dt>
                <dd>{selected.instructions}</dd>
              </div>
              <div><dt>Created</dt><dd>{formatDate(selected.createdAt)}</dd></div>
              {selected.acceptedAt && <div><dt>Accepted</dt><dd>{formatDate(selected.acceptedAt)}</dd></div>}
              {selected.pickedUpAt && <div><dt>Picked up</dt><dd>{formatDate(selected.pickedUpAt)}</dd></div>}
              {selected.deliveredAt && <div><dt>Delivered</dt><dd>{formatDate(selected.deliveredAt)}</dd></div>}
              {selected.disputedAt && <div><dt>Disputed</dt><dd>{formatDate(selected.disputedAt)}</dd></div>}
              <div><dt>Last updated</dt><dd>{formatDate(selected.updatedAt)}</dd></div>
            </dl>
            <p className="dispute-resolution-note">
              Resolution actions are not available yet. The Order Service has
              no approved transition out of DISPUTED, so this dashboard does
              not move or release credits.
            </p>
            <button
              className="button button-outline"
              disabled={detailLoading}
              onClick={() => setSelected(null)}
            >
              Close details
            </button>
          </div>
        </section>
      )}
      {loading ? (
        <p role="status">Loading disputed errands…</p>
      ) : errands.length === 0 ? (
        <p>No disputed errands.</p>
      ) : (
        <div className="admin-list">
          {errands.map((errand) => (
            <article
              className="admin-card admin-heading disputed-errand-card"
              key={errand.id}
            >
              <div>
                <div className="disputed-errand-heading">
                  <h3>{errand.description}</h3>
                  <ErrandStatus status={errand.status} />
                </div>
                <p><strong>Errand ID:</strong> {errand.id}</p>
                <p>
                  <strong>Requester:</strong> {participant(errand.requesterUsername)} ·{" "}
                  <strong>Courier:</strong> {participant(errand.courierUsername)}
                </p>
                <p><strong>Pickup:</strong> {errand.pickupSupplierName} · {errand.pickupLocationLabel}</p>
                <p><strong>Deliver to:</strong> {errand.deliveryDestination}</p>
                <p><strong>Offered credits:</strong> {errand.offeredCredits.toLocaleString()}</p>
                <p>
                  <strong>Disputed:</strong>{" "}
                  {errand.disputedAt ? formatDate(errand.disputedAt) : "Timestamp unavailable"}
                </p>
              </div>
              <button
                className="button button-outline"
                disabled={detailLoading}
                onClick={() => void viewDetails(errand.id)}
              >
                {detailLoading ? "Loading details…" : "View details"}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
