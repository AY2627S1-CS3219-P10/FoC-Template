import { NextRequest } from "next/server";
import { accessToken, backend, BackendError, errorResponse, json, requireSameOrigin } from "@/services/backend.server";
import type { Errand, ErrandOperation } from "@/services/contracts";
import { withCourierUsername } from "@/services/errand-identity.server";
const actions = new Set(["accept", "pickup", "deliver", "courier-cancel", "confirm", "dispute", "respond-dispute", "resolve-dispute", "cancel"]);
export async function POST(request: NextRequest, context: { params: Promise<{ id: string; action: string }> }) {
  try {
    requireSameOrigin(request);
    const token = accessToken(request);
    const { id, action } = await context.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new BackendError(400, "Invalid errand identifier.");
    if (!actions.has(action)) throw new BackendError(404, "Unknown errand action.");
    const raw = await request.text();
    if (raw.length > 4096) throw new BackendError(413, "The request is too large.");
    let body: Record<string, unknown>; try { body = JSON.parse(raw); } catch { throw new BackendError(400, "Invalid request."); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new BackendError(400, "Invalid request.");
    let forwarded: Record<string, unknown> = {};
    let idempotencyKey: string | undefined;
    if (action === "dispute" || action === "respond-dispute") {
      const expected = action === "dispute" ? "explanation" : "response";
      if (Object.keys(body).length !== 1 || typeof body[expected] !== "string") throw new BackendError(400, "A dispute statement is required.");
      const statement = body[expected].trim();
      if (!statement || statement.length > 2000) throw new BackendError(400, "A dispute statement must contain 1 to 2000 characters.");
      forwarded = { statement };
    } else if (action === "resolve-dispute") {
      if (Object.keys(body).sort().join(",") !== "idempotencyKey,outcome" || typeof body.idempotencyKey !== "string" || !["REFUND_REQUESTER", "PAY_COURIER"].includes(String(body.outcome))) throw new BackendError(400, "A valid resolution outcome and idempotency key are required.");
      idempotencyKey = body.idempotencyKey;
      forwarded = { outcome: body.outcome };
    } else if (Object.keys(body).length) throw new BackendError(400, "This action does not accept additional fields.");
    const result = await backend<Errand | ErrandOperation>("order", `errands/${id}/${action}`, { method: "POST", body: forwarded, token, idempotencyKey });
    return json(await withCourierUsername(result, token), result.status === "PENDING" ? 202 : 200);
  } catch (error) { return errorResponse(error); }
}
