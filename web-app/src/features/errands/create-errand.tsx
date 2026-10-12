"use client";
import { useEffect, useRef, useState } from "react";
import { ApiError, authenticatedRequest } from "@/services/api";
import { useCredits } from "@/features/credits/credit-provider";
import type { ErrandOperation, Supplier } from "@/services/contracts";

type Submission = { idempotencyKey: string; pickupLocationId: string; description: string; deliveryDestination: string; instructions: string; offeredCredits: number };
export function CreateErrand({ onCreated }: { onCreated: () => void }) {
  const credits = useCredits();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [operationId, setOperationId] = useState<string | null>(null);
  const locked = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    let active = true;
    authenticatedRequest<Supplier[]>("suppliers").then((data) => { if (active) { setSuppliers(data); setLoadError(""); } }).catch((failure) => { if (active) setLoadError(failure instanceof Error ? failure.message : "Unable to load pickup locations."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  async function send(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (locked.current) return;
    let input = submission;
    if (!input) {
      const data = new FormData(formRef.current!);
      input = { idempotencyKey: crypto.randomUUID(), pickupLocationId: String(data.get("pickupLocationId")), description: String(data.get("description")).trim(), deliveryDestination: String(data.get("deliveryDestination")).trim(), instructions: String(data.get("instructions")).trim(), offeredCredits: Number(data.get("offeredCredits")) };
      if (!input.description || !input.deliveryDestination || !input.instructions) { setError("Complete all required fields."); return; }
    }
    locked.current = true; setBusy(true); setError(""); setNotice(""); setSubmission(input);
    try {
      const result = operationId
        ? await authenticatedRequest<ErrandOperation>(`errand-operations/${operationId}`)
        : await authenticatedRequest<ErrandOperation>("errands", input);
      if (result.status === "SUCCEEDED") {
        setSubmission(null); setOperationId(null); formRef.current?.reset(); setNotice("Errand created. Your offered credits have been reserved."); credits.refresh(); onCreated();
      } else if (result.status === "FAILED") {
        setSubmission(null); setOperationId(null); setError("Your errand could not be created. Check your credits and pickup location, then try again."); credits.refresh();
      } else { setOperationId(result.operationId); setNotice("Your request is still being processed. Check its status shortly."); }
    } catch (failure) {
      if (failure instanceof ApiError && failure.status >= 400 && failure.status < 500 && ![408, 429].includes(failure.status)) { setSubmission(null); setOperationId(null); }
      setError(failure instanceof Error ? failure.message : "Unable to create your errand.");
    } finally { locked.current = false; setBusy(false); }
  }
  const locations = suppliers.flatMap((supplier) => supplier.locations.map((location) => ({ ...location, supplierName: supplier.name })));
  return <section className="create-errand" aria-labelledby="create-errand-title">
    <h2 id="create-errand-title">Create an errand</h2>
    <p>Your offered credits will be reserved when the errand is created.{credits.balance && ` Available: ${credits.balance.availableCredits.toLocaleString()} credits.`}</p>
    {loadError ? <div><p role="alert">{loadError}</p><button className="button button-light" onClick={() => { setLoading(true); setAttempt((value) => value + 1); }}>Retry pickup locations</button></div> : loading ? <p role="status">Loading pickup locations…</p> : !locations.length ? <p>No pickup locations are available for new errands.</p> : null}
    <form ref={formRef} className="account-form" onSubmit={send}>
      <fieldset disabled={busy || !!submission || loading || !!loadError || !locations.length}>
        <label>Pickup location<select name="pickupLocationId" required defaultValue=""><option value="" disabled>Select a pickup location</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.supplierAtLocation}</option>)}</select></label>
        <label>Errand description<textarea name="description" required maxLength={1000} rows={3} /></label>
        <label>Delivery destination<input name="deliveryDestination" required maxLength={250} /></label>
        <label>Pickup or delivery instructions<textarea name="instructions" required maxLength={1000} rows={2} /></label>
        <label>Offered credits<input name="offeredCredits" type="number" required min={1} max={2000000000} step={1} /></label>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {submission && !busy ? <button className="button button-dark" type="button" onClick={() => void send()}>{operationId ? "Check request status" : "Retry this request"}</button> : <button className="button button-dark" type="submit" disabled={busy || loading || !!loadError || !locations.length}>{busy ? "Submitting…" : "Create errand"}</button>}
    </form>
  </section>;
}
