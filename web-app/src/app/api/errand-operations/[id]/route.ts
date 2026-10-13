import { NextRequest } from "next/server";
import { accessToken, backend, BackendError, errorResponse, json } from "@/services/backend.server";
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new BackendError(400, "Invalid operation identifier.");
    return json(await backend("order", `errand-operations/${id}`, { token: accessToken(request) }));
  } catch (error) { return errorResponse(error); }
}
