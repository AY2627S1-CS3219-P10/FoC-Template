import { NextRequest } from "next/server";
import {
  accessToken,
  backend,
  BackendError,
  errorResponse,
  json,
  requireSameOrigin,
} from "@/services/backend.server";
import type { Profile } from "@/services/contracts";

type Context = { params: Promise<{ path: string[] }> };
const uuid =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

async function handle(request: NextRequest, context: Context) {
  try {
    const path = (await context.params).path.join("/");
    const method = request.method;
    const accounts =
      (method === "GET" && path === "accounts") ||
      (method === "PATCH" &&
        new RegExp(`^accounts/${uuid}/(?:administrator|suspension)$`).test(
          path,
        ));
    const reports =
      (method === "GET" && path === "reports") ||
      (method === "GET" && new RegExp(`^reports/${uuid}$`).test(path)) ||
      (method === "PATCH" &&
        new RegExp(`^reports/${uuid}/resolve$`).test(path));
    const suppliers =
      (path === "suppliers" && ["GET", "POST"].includes(method)) ||
      (path === "suppliers/campus-locations" && method === "GET") ||
      (["PATCH", "DELETE"].includes(method) &&
        new RegExp(`^suppliers/${uuid}$`).test(path)) ||
      (method === "PATCH" &&
        new RegExp(`^suppliers/${uuid}/locations/${uuid}$`).test(path));
    if (!accounts && !reports && !suppliers)
      return json({ message: "Not found." }, 404);
    if (method !== "GET") requireSameOrigin(request, method !== "DELETE");
    const token = accessToken(request);
    // Check the current session and privileges, including supplier operations.
    const profile = await backend<Profile>("user", "accounts/me", { token });
    if (!profile.isAdmin)
      throw new BackendError(403, "Administrator privileges are required.");
    let body: unknown;
    if (["POST", "PATCH"].includes(method)) {
      const raw = await request.text();
      if (raw.length > 8192)
        throw new BackendError(413, "The request is too large.");
      try {
        body = JSON.parse(raw);
      } catch {
        throw new BackendError(400, "Invalid JSON request.");
      }
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw new BackendError(400, "Invalid request.");
    }
    let query = "";
    if (method === "GET" && accounts)
      query = `?${new URLSearchParams({ search: request.nextUrl.searchParams.get("search") || "" })}`;
    if (method === "GET" && reports && path === "reports") {
      const status = request.nextUrl.searchParams.get("status");
      query = status ? `?${new URLSearchParams({ status })}` : "";
    }
    const upstream =
      method === "GET" && suppliers ? path : `admin/${path}${query}`;
    const result = await backend<unknown>(
      accounts || reports ? "user" : "supplier",
      upstream,
      { token, method, body },
    );
    return json(result ?? { success: true }, method === "POST" ? 201 : 200);
  } catch (error) {
    return errorResponse(error);
  }
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
