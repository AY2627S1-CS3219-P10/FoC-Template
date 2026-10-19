"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { useCredits } from "@/features/credits/credit-provider";
import { ApiError, authenticatedRequest } from "@/services/api";
import type { Errand, ErrandOperation } from "@/services/contracts";
import { ErrandStatus } from "./errand-status";
import { ErrandActions } from "./errand-actions";
type Mutation = { method: "PATCH" | "DELETE"; body: Record<string, unknown>; operationId?: string };
export function ErrandDetail({ id }: { id: string }) {
  const auth = useAuth();
  return <ErrandDetailContent key={`${id}:${auth.user?.id ?? "guest"}`} id={id} />;
}
function ErrandDetailContent({ id }: { id: string }) {
  const auth = useAuth(); const credits = useCredits(); const userId = auth.user?.id;
  const [state, setState] = useState<{ userId?: string; errand: Errand | null; error: string; loading: boolean }>({ errand: null, error: "", loading: true });
  const [attempt, setAttempt] = useState(0); const [editing, setEditing] = useState(false); const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false); const locked = useRef(false); const [mutation, setMutation] = useState<Mutation | null>(null); const [message, setMessage] = useState(""); const [error, setError] = useState(""); const [deleted, setDeleted] = useState(false);
  useEffect(() => {
    if (!userId || busy || mutation || editing || confirmDelete || deleted) return; let active = true;
    authenticatedRequest<Errand>(`errands/${id}`).then((errand) => { if (active) setState({ userId, errand, error: "", loading: false }); }).catch((failure) => { if (active) setState({ userId, errand: null, error: failure instanceof Error ? failure.message : "Unable to load this errand.", loading: false }); });
    return () => { active = false; };
  }, [userId, id, attempt, busy, mutation, editing, confirmDelete, deleted]);
  useEffect(() => {
    if (!userId || busy || mutation || editing || confirmDelete || deleted) return;
    const timer = setInterval(() => setAttempt((value) => value + 1), 20_000);
    return () => clearInterval(timer);
  }, [userId, busy, mutation, editing, confirmDelete, deleted]);
  const current = state.userId === userId ? state : { errand: null, error: "", loading: true };
  const errand = current.errand; const owner = errand?.requesterId === userId; const admin = auth.user?.isAdmin === true;
  const editable = owner && errand?.status === "OPEN" && !errand.courierId;
  const deletable = admin || (owner && errand?.status === "OPEN" && !errand.courierId);
  async function apply(input: Mutation) {
    if (locked.current) return; locked.current = true; setBusy(true); setError(""); setMessage(""); setMutation(input);
    try {
      const result = input.operationId ? await authenticatedRequest<ErrandOperation>(`errand-operations/${input.operationId}`) : await authenticatedRequest<ErrandOperation>(`errands/${id}`, input.body, input.method);
      if (result.status === "PENDING") { setMutation({ ...input, operationId: result.operationId }); setMessage("Your change is still being processed. Check its status shortly."); }
      else if (result.status === "FAILED") { setMutation(null); setError("The change could not be completed. No changes were applied. Reload the errand before trying again."); credits.refresh(); }
      else { setMutation(null); setEditing(false); setConfirmDelete(false); credits.refresh(); if (input.method === "DELETE" && result.errand?.status !== "CANCELLED") setDeleted(true); else if (input.method === "DELETE") { if (result.errand) setState({ userId, errand: result.errand, error: "", loading: false }); setMessage("Request cancelled. Reserved credits have been released."); } else { if (result.errand) setState({ userId, errand: result.errand, error: "", loading: false }); setMessage("Errand updated."); } }
    } catch (failure) {
      if (failure instanceof ApiError && failure.status >= 400 && failure.status < 500 && ![408, 429].includes(failure.status)) setMutation(null);
      setError(failure instanceof Error ? failure.message : "Unable to save your change.");
    } finally { locked.current = false; setBusy(false); }
  }
  if (auth.loading) return <p role="status">Checking your session…</p>;
  if (auth.error) return <div className="empty-state"><p role="alert">{auth.error}</p><button className="button button-dark" onClick={() => void auth.reload()}>Try again</button></div>;
  if (!auth.user) return <div className="empty-state"><h1>Errand details</h1><p>Log in to view this errand.</p><Link href="/login">Log in</Link></div>;
  if (deleted) return <section className="detail-page"><h1>Errand deleted</h1><p role="status">The request has been removed. Any reserved credits have been released; completed transfers are preserved.</p><Link href="/errands">Back to errands</Link></section>;
  return <section className="detail-page"><Link className="text-link back-link" href="/errands">← Back to errands</Link>
    {current.loading ? <p role="status">Loading errand…</p> : current.error ? <><p role="alert">{current.error}</p><button className="button button-dark" onClick={() => setAttempt((value) => value + 1)}>Retry errand</button></> : errand && <article className="detail-card errand-detail-card">
      <h1>{errand.description}</h1><dl>
        <div><dt>Errand ID</dt><dd>{errand.id}</dd></div>
        <div><dt>Pickup location</dt><dd>{errand.pickupLocationLabel}</dd></div>
        <div><dt>Deliver to</dt><dd>{errand.deliveryDestination}</dd></div><div><dt>Instructions</dt><dd>{errand.instructions}</dd></div>
        <div><dt>Offered credits</dt><dd>{errand.offeredCredits.toLocaleString()} credits</dd></div><div><dt>Status</dt><dd><ErrandStatus status={errand.status} /></dd></div>
        <div><dt>Requester</dt><dd>{owner ? auth.user.username : errand.requesterUsername || "Unavailable user"}</dd></div>{errand.courierId && <div><dt>Courier</dt><dd>{errand.courierId === auth.user.id ? auth.user.username : errand.courierUsername || "Unavailable user"}</dd></div>}
        <div><dt>Created</dt><dd>{new Date(errand.createdAt).toLocaleString("en-SG", { timeZone: "Asia/Singapore" })}</dd></div><div><dt>Last updated</dt><dd>{new Date(errand.updatedAt).toLocaleString("en-SG", { timeZone: "Asia/Singapore" })}</dd></div>
      </dl>
      <div className="errand-lifecycle-dates">{([
        ["Accepted", errand.acceptedAt], ["Picked up", errand.pickedUpAt], ["Delivered", errand.deliveredAt], ["Disputed", errand.disputedAt], ["Completed", errand.completedAt], ["Cancelled", errand.cancelledAt], ["Expired", errand.expiredAt], ["Expires", errand.expiresAt],
      ] as const).filter(([, value]) => value).map(([label, value]) => <p key={label}>{label}: <time dateTime={value!}>{new Date(value!).toLocaleString("en-SG", { timeZone: "Asia/Singapore" })}</time></p>)}</div>
      <button className="button button-light" disabled={busy || !!mutation || editing} onClick={() => setAttempt((value) => value + 1)}>Refresh status</button>
      <ErrandActions errand={errand} userId={auth.user.id} disabled={!!mutation || editing || confirmDelete} onBusy={setBusy} onRefresh={() => setAttempt((value) => value + 1)} onUpdated={(next) => { setState({ userId, errand: next, error: "", loading: false }); setEditing(false); setConfirmDelete(false); }} />
      {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
      {mutation ? <button className="button button-dark" disabled={busy} onClick={() => void apply(mutation)}>{busy ? "Processing…" : mutation.operationId ? "Check change status" : "Retry this change"}</button> : <>
        {editable && !editing && <button className="button button-edit" disabled={busy} onClick={() => { setEditing(true); setConfirmDelete(false); }}>Edit errand</button>}
        {deletable && !confirmDelete && <button className="button button-delete" disabled={busy} onClick={() => { setConfirmDelete(true); setEditing(false); }}>Delete errand</button>}
      </>}
      {confirmDelete && !mutation && <div className="errand-delete-confirm"><p>Delete this request? Reserved credits will be returned. This cannot be undone.</p><button className="button button-delete" disabled={busy} onClick={() => void apply({ method: "DELETE", body: { idempotencyKey: crypto.randomUUID() } })}>Confirm delete</button><button className="button button-light" onClick={() => setConfirmDelete(false)}>Keep errand</button></div>}
      {editing && <form className="account-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const description = String(data.get("description")).trim(), deliveryDestination = String(data.get("deliveryDestination")).trim(), instructions = String(data.get("instructions")).trim(); if (!description || !deliveryDestination || !instructions) { setError("Complete all required fields."); return; } void apply({ method: "PATCH", body: { idempotencyKey: crypto.randomUUID(), expectedVersion: errand.version, description, deliveryDestination, instructions, offeredCredits: Number(data.get("offeredCredits")) } }); }}>
        <fieldset disabled={busy || !!mutation}><legend>Edit your request</legend><label>Errand description<textarea name="description" required maxLength={1000} defaultValue={errand.description} /></label><label>Delivery destination<input name="deliveryDestination" required maxLength={250} defaultValue={errand.deliveryDestination} /></label><label>Pickup or delivery instructions<textarea name="instructions" required maxLength={1000} defaultValue={errand.instructions} /></label><label>Offered credits<input name="offeredCredits" type="number" min={1} max={2000000000} step={1} required defaultValue={errand.offeredCredits} /></label></fieldset>
        <p>Increasing the offer reserves additional credits. Decreasing it returns the difference.</p><button className="button button-edit" disabled={busy || !!mutation}>Save changes</button><button type="button" className="button button-light" disabled={busy || !!mutation} onClick={() => setEditing(false)}>Cancel editing</button>
      </form>}
    </article>}
  </section>;
}
