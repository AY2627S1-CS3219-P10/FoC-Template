import { NextRequest } from "next/server";
import {
  backend,
  BackendError,
  json,
  errorResponse,
  requireSameOrigin,
  readFields,
  setSession,
  clearSession,
  REFRESH_COOKIE,
  accessToken,
} from "@/services/backend.server";
import type { Authentication, Profile } from "@/services/contracts";

type Context = { params: Promise<{ action: string }> };

export async function GET(request: NextRequest, context: Context) {
  const { action } = await context.params;
  if (action !== "session") return json({ message: "Not found." }, 404);
  try {
    return json(
      await backend<Profile>("user", "accounts/me", {
        token: accessToken(request),
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, context: Context) {
  const { action } = await context.params;
  try {
    requireSameOrigin(request);
    if (action === "login") {
      const body = await readFields(request, ["email", "password"]);
      const auth = await backend<Authentication>("user", "auth/login", {
        method: "POST",
        body,
      });
      const response = json({ user: auth.user });
      setSession(response, request, auth);
      return response;
    }
    if (action === "refresh") {
      const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
      if (!refreshToken)
        return clearSession(
          json({ message: "Please log in to continue." }, 401),
        );
      const auth = await backend<Authentication>("user", "auth/refresh", {
        method: "POST",
        body: { refreshToken },
      });
      const response = json({ user: auth.user });
      setSession(response, request, auth);
      return response;
    }
    if (action === "logout") {
      const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
      if (refreshToken)
        await backend<void>("user", "auth/logout", {
          method: "POST",
          body: { refreshToken },
        });
      // If revocation fails, retain cookies so the user can retry rather than claim success.
      return clearSession(json({ message: "Logged out." }));
    }
    const publicActions: Record<string, { path: string; fields: string[] }> = {
      register: {
        path: "accounts/register",
        fields: ["username", "email", "phoneNumber", "password"],
      },
      verify: { path: "accounts/verify-email", fields: ["email", "code"] },
      resend: { path: "accounts/verify-email/resend", fields: ["email"] },
    };
    const operation = Object.hasOwn(publicActions, action)
      ? publicActions[action]
      : undefined;
    if (!operation) return json({ message: "Not found." }, 404);
    const body = await readFields(request, operation.fields);
    const result = await backend<unknown>("user", operation.path, {
      method: "POST",
      body,
    });
    return json(result ?? { success: true }, action === "register" ? 201 : 200);
  } catch (error) {
    const response = errorResponse(error);
    if (
      action === "refresh" &&
      error instanceof BackendError &&
      [400, 401, 403].includes(error.status)
    )
      clearSession(response);
    return response;
  }
}
