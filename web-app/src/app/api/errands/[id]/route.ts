import { NextRequest } from "next/server";
import { accessToken, backend, BackendError, errorResponse, json, requireSameOrigin } from "@/services/backend.server";
import type { Errand, ErrandOperation } from "@/services/contracts";
import { withCourierUsername } from "@/services/errand-identity.server";
type Context = { params: Promise<{ id: string }> };
async function identifier(context: Context) { const { id } = await context.params; if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new BackendError(400, "Invalid errand identifier."); return id; }
export async function GET(request: NextRequest, context: Context) {
  try { const token = accessToken(request); const result = await backend<Errand>("order", `errands/${await identifier(context)}`, { token }); return json(await withCourierUsername(result, token)); } catch (error) { return errorResponse(error); }
}
async function mutate(request: NextRequest, context: Context, method: "PATCH" | "DELETE") {
  try {
    requireSameOrigin(request); const token = accessToken(request); const id = await identifier(context);
    const raw = await request.text(); if (raw.length > 8192) throw new BackendError(413, "The request is too large.");
    let body; try { body = JSON.parse(raw); } catch { throw new BackendError(400, "Invalid request."); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new BackendError(400, "Invalid request.");
    const { idempotencyKey, ...fields } = body;
    if (typeof idempotencyKey !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) throw new BackendError(400, "Invalid request identifier.");
    if (method === "DELETE" && Object.keys(fields).length) throw new BackendError(400, "Unexpected fields.");
    const result = await backend<ErrandOperation>("order", `errands/${id}`, { method, token, idempotencyKey, ...(method === "PATCH" ? { body: fields } : {}) });
    return json(await withCourierUsername(result, token), result.status === "PENDING" ? 202 : 200);
  } catch (error) { return errorResponse(error); }
}
export async function PATCH(request: NextRequest, context: Context) { return mutate(request, context, "PATCH"); }
export async function DELETE(request: NextRequest, context: Context) { return mutate(request, context, "DELETE"); }
