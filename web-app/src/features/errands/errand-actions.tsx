"use client";
import { useRef, useState } from "react";
import { authenticatedRequest } from "@/services/api";
import { useCredits } from "@/features/credits/credit-provider";
import type { Errand, ErrandOperation } from "@/services/contracts";
type Action = "accept" | "pickup" | "deliver" | "courier-cancel" | "confirm" | "dispute" | "cancel";
const labels: Record<Action, string> = { accept: "Accept errand", pickup: "Mark as picked up", deliver: "Mark as delivered", "courier-cancel": "Release errand", confirm: "Confirm receipt", dispute: "Dispute delivery", cancel: "Cancel request" };
const confirmationLabels: Partial<Record<Action, string>> = { "courier-cancel": "Confirm release", confirm: "Confirm receipt", dispute: "Confirm dispute", cancel: "Confirm cancellation" };
const confirmations: Partial<Record<Action, string>> = {
  "courier-cancel": "Release this errand? It will reopen for another courier, and you will not be able to accept it again.",
  confirm: "Confirm you received the item? This completes the errand and starts the credit transfer to the courier.",
  dispute: "Dispute this delivery? Credits will remain reserved while the dispute is unresolved.",
  cancel: "Cancel this request? Reserved credits will be returned and the courier assignment will be released.",
};
export function ErrandActions({ errand, userId, disabled, onUpdated, onBusy, onRefresh }: { errand: Errand; userId: string; disabled: boolean; onUpdated: (errand: Errand) => void; onBusy: (busy: boolean) => void; onRefresh: () => void }) {
  const credits = useCredits(); const lock = useRef(false);
  const [busy, setBusy] = useState(false); const [confirmation, setConfirmation] = useState<Action | null>(null);
  const [pending, setPending] = useState<string | null>(null); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const owner = errand.requesterId === userId, courier = errand.courierId === userId;
  const available: Action[] = [];
  if (!owner && errand.status === "OPEN" && !errand.courierId && errand.availableForAcceptance === true) available.push("accept");
  if (courier && errand.status === "ACCEPTED") available.push("pickup", "courier-cancel");
  if (courier && errand.status === "PICKED_UP") available.push("deliver");
  if (owner && ["PICKED_UP", "DELIVERED"].includes(errand.status)) available.push("confirm");
  if (owner && errand.status === "DELIVERED") available.push("dispute");
  if (owner && ["OPEN", "ACCEPTED"].includes(errand.status)) available.push("cancel");
  async function run(action?: Action) {
    if (lock.current) return; lock.current = true; setBusy(true); onBusy(true); setError(""); setNotice("");
    let processing = false;
    try {
      const result = pending ? await authenticatedRequest<ErrandOperation>(`errand-operations/${pending}`) : await authenticatedRequest<Errand | ErrandOperation>(`errands/${errand.id}/${action}`, {});
      if ("operationId" in result) {
        if (result.status === "PENDING") { processing = true; setPending(result.operationId); setNotice("Cancellation is still being processed. Check its status shortly."); }
        else if (result.status === "FAILED") { setPending(null); setError("Cancellation could not be completed. Refresh the status before trying again."); onRefresh(); }
        else { setPending(null); if (result.errand) onUpdated(result.errand); else onRefresh(); setNotice("Request cancelled. Reserved credits have been released."); credits.refresh(); }
      } else { onUpdated(result); setNotice(action === "confirm" ? "Receipt confirmed. The credit transfer is being processed." : action === "courier-cancel" ? "Errand released. Another courier can now accept it." : "Errand status updated."); credits.refresh(); }
      setConfirmation(null);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to update this errand."); processing = !!pending; if (!pending) onRefresh(); }
    finally { lock.current = false; setBusy(false); onBusy(processing); }
  }
  return <section className="errand-actions" aria-label="Errand actions">
    {errand.status === "ACCEPTED" && courier && <p>Collect the item within 30 minutes of acceptance. Otherwise the errand reopens and you cannot accept it again.</p>}
    {errand.status === "DELIVERED" && <p>Awaiting requester confirmation. Undisputed deliveries complete automatically 4 hours after delivery; the credit transfer is then processed.</p>}
    {errand.status === "DISPUTED" && <p>This delivery is disputed. Credits remain reserved until the dispute is resolved.</p>}
    {!owner && errand.status === "OPEN" && errand.availableForAcceptance === false && <p>This errand is not available for you to accept. It may have expired, or you may have previously released it or missed pickup.</p>}
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {pending ? <button className="button button-dark" disabled={busy || disabled} onClick={() => void run()}>Check cancellation status</button> : confirmation ? <div className="errand-delete-confirm"><p>{confirmations[confirmation]}</p><button className={`button ${["cancel", "courier-cancel", "dispute"].includes(confirmation) ? "button-delete" : "button-edit"}`} disabled={busy || disabled} onClick={() => void run(confirmation)}>{confirmationLabels[confirmation]}</button><button className="button button-light" disabled={busy || disabled} onClick={() => setConfirmation(null)}>Go back</button></div> : <div className="errand-action-buttons">{available.map((action) => <button key={action} className={`button ${["cancel", "courier-cancel", "dispute"].includes(action) ? "button-delete" : "button-edit"}`} disabled={busy || disabled} onClick={() => { if (confirmations[action]) setConfirmation(action); else void run(action); }}>{busy ? "Updating…" : labels[action]}</button>)}</div>}
  </section>;
}
