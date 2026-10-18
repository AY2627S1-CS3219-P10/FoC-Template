const labels: Record<string, string> = { OPEN: "Open", ACCEPTED: "Accepted", PICKED_UP: "Picked up", DELIVERED: "Delivered", DISPUTED: "Disputed", COMPLETED: "Completed", CANCELLED: "Cancelled", EXPIRED: "Expired" };
export function ErrandStatus({ status }: { status: string }) {
  return <span className={`errand-status errand-status-${status.toLowerCase().replace(/[^a-z_]/g, "")}`} aria-label={`Status: ${labels[status] ?? status}`}>{labels[status] ?? status}</span>;
}
