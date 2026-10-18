import { NextRequest } from "next/server";
import { accessToken, backend, BackendError, errorResponse, json, requireSameOrigin } from "@/services/backend.server";
import type { Errand, ErrandOperation } from "@/services/contracts";
const actions = new Set(["accept", "pickup", "deliver", "courier-cancel", "confirm", "dispute", "cancel"]);
export async function POST(request: NextRequest, context: { params: Promise<{ id: string; action: string }> }) {
  try {
    requireSameOrigin(request);
    const token = accessToken(request);
    const { id, action } = await context.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new BackendError(400, "Invalid errand identifier.");
    if (!actions.has(action)) throw new BackendError(404, "Unknown errand action.");
    const raw = await request.text();
    if (raw.length > 1024) throw new BackendError(413, "The request is too large.");
    let body; try { body = JSON.parse(raw); } catch { throw new BackendError(400, "Invalid request."); }
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length) throw new BackendError(400, "This action does not accept additional fields.");
    const result = await backend<Errand | ErrandOperation>("order", `errands/${id}/${action}`, { method: "POST", body: {}, token });
    return json(result, result.status === "PENDING" ? 202 : 200);
  } catch (error) { return errorResponse(error); }
}
