/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of errand status rendering and interaction code (ErrandStatus).
 * Author review: Validated ErrandStatus rendered content, props usage in web-app/errand-status.tsx; refined JSX layout and user-facing wording.
 */

const labels: Record<string, string> = { OPEN: "Open", ACCEPTED: "Accepted", PICKED_UP: "Picked up", DELIVERED: "Delivered", DISPUTED: "Disputed", COMPLETED: "Completed", CANCELLED: "Cancelled", EXPIRED: "Expired" };
export function ErrandStatus({ status }: { status: string }) {
  return <span className={`errand-status errand-status-${status.toLowerCase().replace(/[^a-z_]/g, "")}`} aria-label={`Status: ${labels[status] ?? status}`}>{labels[status] ?? status}</span>;
}
