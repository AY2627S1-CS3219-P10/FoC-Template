import { NextRequest } from "next/server";
import { accessToken, backend, BackendError, errorResponse, json, requireSameOrigin } from "@/services/backend.server";
import type { Errand, ErrandOperation } from "@/services/contracts";
export async function GET(request: NextRequest) {
  try {
    const query = new URLSearchParams();
    for (const key of ["limit", "offset", "sort"]) { const value = request.nextUrl.searchParams.get(key); if (value !== null) query.set(key, value); }
    const path = request.nextUrl.searchParams.get("scope") === "manage" ? "errands/manage" : "errands";
    return json(await backend<Errand[]>("order", `${path}?${query}`, { token: accessToken(request) }));
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const token = accessToken(request);
    const raw = await request.text();
    if (raw.length > 8192) throw new BackendError(413, "The request is too large.");
    let body;
    try { body = JSON.parse(raw); } catch { throw new BackendError(400, "Invalid request."); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new BackendError(400, "Invalid request.");
    const { idempotencyKey, ...fields } = body;
    if (typeof idempotencyKey !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) throw new BackendError(400, "Invalid request identifier.");
    const result = await backend<ErrandOperation>("order", "errands", { method: "POST", token, body: fields, idempotencyKey });
    return json(result, result.status === "PENDING" ? 202 : 201);
  } catch (error) { return errorResponse(error); }
}
