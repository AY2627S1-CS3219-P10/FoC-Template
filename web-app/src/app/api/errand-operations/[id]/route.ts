import { NextRequest } from "next/server";
import { accessToken, backend, BackendError, errorResponse, json } from "@/services/backend.server";
import type { ErrandOperation } from "@/services/contracts";
import { withCourierUsername } from "@/services/errand-identity.server";
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new BackendError(400, "Invalid operation identifier.");
    const token = accessToken(request);
    const result = await backend<ErrandOperation>("order", `errand-operations/${id}`, { token });
    return json(await withCourierUsername(result, token));
  } catch (error) { return errorResponse(error); }
}
