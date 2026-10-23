"use client";

import { useEffect, useRef, useState } from "react";
import { useCredits } from "@/features/credits/credit-provider";
import { ApiError, authenticatedRequest } from "@/services/api";
import type { ErrandOperation, Supplier } from "@/services/contracts";

type Submission = {
  idempotencyKey: string;
  pickupLocationId: string;
  description: string;
  deliveryDestination: string;
  instructions: string;
  offeredCredits: number;
};

const DEFAULT_OFFER = 10;

export function CreateErrand({ onCreated }: { onCreated: () => void }) {
  const credits = useCredits();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [offeredCredits, setOfferedCredits] = useState(DEFAULT_OFFER);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [operationId, setOperationId] = useState<string | null>(null);
  const locked = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    let active = true;
    authenticatedRequest<Supplier[]>("suppliers")
      .then((data) => {
        if (active) {
          setSuppliers(data);
          setLoadError("");
        }
      })
      .catch((failure) => {
        if (active)
          setLoadError(
            failure instanceof Error
              ? failure.message
              : "Unable to load pickup locations.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  const availableCredits = credits.balance?.availableCredits;
  const reservedCredits = credits.balance?.reservedCredits;
  const validOffer = Number.isSafeInteger(offeredCredits) && offeredCredits > 0;
  const canAfford =
    availableCredits !== undefined &&
    validOffer &&
    offeredCredits <= availableCredits;
  const remainingCredits =
    availableCredits === undefined
      ? undefined
      : Math.max(availableCredits - (validOffer ? offeredCredits : 0), 0);

  function changeOffer(next: number) {
    setOfferedCredits(Math.max(1, Math.trunc(next) || 1));
    setError("");
  }

  async function send(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (locked.current) return;
    let input = submission;
    if (!input) {
      if (!canAfford) {
        setError(
          availableCredits === undefined
            ? "Wait for your credit balance to load before creating an errand."
            : "Your offer cannot exceed your available credits.",
        );
        return;
      }
      const data = new FormData(formRef.current!);
      input = {
        idempotencyKey: crypto.randomUUID(),
        pickupLocationId: String(data.get("pickupLocationId")),
        description: String(data.get("description")).trim(),
        deliveryDestination: String(data.get("deliveryDestination")).trim(),
        instructions: String(data.get("instructions")).trim(),
        offeredCredits,
      };
      if (
        !input.description ||
        !input.deliveryDestination ||
        !input.instructions
      ) {
        setError("Complete all required fields.");
        return;
      }
    }
    locked.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    setSubmission(input);
    try {
      const result = operationId
        ? await authenticatedRequest<ErrandOperation>(
            `errand-operations/${operationId}`,
          )
        : await authenticatedRequest<ErrandOperation>("errands", input);
      if (result.status === "SUCCEEDED") {
        setSubmission(null);
        setOperationId(null);
        formRef.current?.reset();
        setOfferedCredits(DEFAULT_OFFER);
        setNotice("Errand created. Your offered credits have been reserved.");
        credits.refresh();
        onCreated();
      } else if (result.status === "FAILED") {
        setSubmission(null);
        setOperationId(null);
        setError(
          "Your errand could not be created. Check your credits and pickup location, then try again.",
        );
        credits.refresh();
      } else {
        setOperationId(result.operationId);
        setNotice(
          "Your request is still being processed. Check its status shortly.",
        );
      }
    } catch (failure) {
      if (
        failure instanceof ApiError &&
        failure.status >= 400 &&
        failure.status < 500 &&
        ![408, 429].includes(failure.status)
      ) {
        setSubmission(null);
        setOperationId(null);
      }
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to create your errand.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  const locations = suppliers.flatMap((supplier) =>
    supplier.locations.map((location) => ({
      ...location,
      supplierName: supplier.name,
    })),
  );
  const formUnavailable =
    busy || !!submission || loading || !!loadError || !locations.length;
  const submitDisabled =
    busy || loading || !!loadError || !locations.length || !canAfford;

  return (
    <section className="create-errand" aria-labelledby="create-errand-title">
      <div className="create-errand-heading">
        <div>
          <p className="eyebrow">REQUEST CAMPUS HELP</p>
          <h1 id="create-errand-title">Create a new errand</h1>
        </div>
        <p>
          Set the reward for your courier. Credits are reserved only after the
          errand is created.
        </p>
      </div>

      {loadError ? (
        <div>
          <p role="alert">{loadError}</p>
          <button
            className="button button-light"
            onClick={() => {
              setLoading(true);
              setAttempt((value) => value + 1);
            }}
          >
            Retry pickup locations
          </button>
        </div>
      ) : loading ? (
        <p role="status">Loading pickup locations…</p>
      ) : !locations.length ? (
        <p>No pickup locations are available for new errands.</p>
      ) : null}

      <form ref={formRef} className="create-errand-layout" onSubmit={send}>
        <div className="create-errand-fields">
          <fieldset disabled={formUnavailable}>
            <label>
              <span>1. Pickup location</span>
              <select name="pickupLocationId" required defaultValue="">
                <option value="" disabled>
                  Select a pickup location
                </option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.supplierAtLocation} · {location.building} ·{" "}
                    {location.floor === null
                      ? "Floor unknown"
                      : `Floor ${location.floor}`}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>2. What do you need?</span>
              <textarea
                aria-label="Errand description"
                name="description"
                required
                maxLength={1000}
                rows={3}
                placeholder="e.g. Pick up one chicken rice from Stall 3"
              />
            </label>
            <label>
              <span>3. Delivery destination</span>
              <input
                name="deliveryDestination"
                required
                maxLength={250}
                placeholder="e.g. COM3, Level 2"
              />
            </label>
            <label>
              <span>4. Pickup or delivery instructions</span>
              <textarea
                name="instructions"
                required
                maxLength={1000}
                rows={2}
                placeholder="Add timing, contact, or item details"
              />
            </label>
            <div className="credit-offer-field">
              <span id="offered-credits-label">5. Offered credits</span>
              <div className="credit-stepper">
                <button
                  type="button"
                  aria-label="Decrease credit offer"
                  onClick={() => changeOffer(offeredCredits - 1)}
                  disabled={formUnavailable || offeredCredits <= 1}
                >
                  −
                </button>
                <input
                  aria-labelledby="offered-credits-label"
                  name="offeredCredits"
                  type="number"
                  required
                  min={1}
                  max={availableCredits ?? 2_000_000_000}
                  step={1}
                  value={offeredCredits}
                  onChange={(event) => changeOffer(Number(event.target.value))}
                />
                <button
                  type="button"
                  aria-label="Increase credit offer"
                  onClick={() => changeOffer(offeredCredits + 1)}
                  disabled={
                    formUnavailable ||
                    availableCredits === undefined ||
                    offeredCredits >= availableCredits
                  }
                >
                  +
                </button>
                <span>credits</span>
              </div>
            </div>
          </fieldset>
        </div>

        <aside className="credit-preview" aria-labelledby="credit-preview-title">
          <h3 id="credit-preview-title">Credit preview</h3>
          {credits.loading ? (
            <p role="status">Loading your balance…</p>
          ) : credits.error ? (
            <div className="credit-preview-error">
              <p role="alert">{credits.error}</p>
              <button
                type="button"
                className="text-link"
                onClick={credits.refresh}
              >
                Retry balance
              </button>
            </div>
          ) : (
            <dl className="credit-preview-totals" aria-live="polite">
              <div>
                <dt>Available now</dt>
                <dd>{availableCredits?.toLocaleString() ?? "—"}</dd>
              </div>
              <div>
                <dt>Will reserve</dt>
                <dd className="credit-preview-reserve">
                  {validOffer ? offeredCredits.toLocaleString() : "—"}
                </dd>
              </div>
              <div className="credit-preview-remaining">
                <dt>Remaining</dt>
                <dd>{remainingCredits?.toLocaleString() ?? "—"}</dd>
              </div>
              <div className="credit-preview-current">
                <dt>Already reserved</dt>
                <dd>{reservedCredits?.toLocaleString() ?? "—"}</dd>
              </div>
            </dl>
          )}
          {!credits.loading && availableCredits !== undefined && !canAfford && (
            <p className="credit-preview-warning" role="alert">
              This offer is higher than your available balance.
            </p>
          )}
          <p className="credit-preview-note">
            <span aria-hidden="true">✓</span>
            Reserved credits are returned if the errand is cancelled.
          </p>
          {error && <p role="alert">{error}</p>}
          {notice && <p role="status">{notice}</p>}
          {submission && !busy ? (
            <button
              className="button button-dark"
              type="button"
              onClick={() => void send()}
            >
              {operationId ? "Check request status" : "Retry this request"}
            </button>
          ) : (
            <button
              className="button button-dark"
              type="submit"
              disabled={submitDisabled}
            >
              {busy ? "Reserving credits…" : "Create errand"}
            </button>
          )}
        </aside>
      </form>
    </section>
  );
}
