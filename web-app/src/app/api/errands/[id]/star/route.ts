/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of route code (POST, DELETE).
 * Author review: Validated POST, DELETE request handlers, parameter handling, and returned values; edited handler naming and formatting.
 */

import { NextRequest } from "next/server";
import { accessToken, backend, BackendError, errorResponse, json, requireSameOrigin } from "@/services/backend.server";

async function save(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const token = accessToken(request);
    const { id } = await context.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      throw new BackendError(400, "Invalid errand identifier.");
    }
    return json(await backend<{ isStarred: boolean }>("order", `errands/${id}/star`, { method: request.method as "POST" | "DELETE", token }));
  } catch (error) { return errorResponse(error); }
}

export const POST = save;
export const DELETE = save;
