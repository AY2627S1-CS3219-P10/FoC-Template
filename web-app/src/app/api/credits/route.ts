import { NextRequest } from "next/server";
import { accessToken, backend, BackendError, errorResponse, json, requireSameOrigin } from "@/services/backend.server";
import type { CreditBalance, Profile } from "@/services/contracts";

export async function GET(request: NextRequest) {
  try {
    const token = accessToken(request);
    // Resolve identity from the live session, never a browser-supplied user ID.
    const user = await backend<Profile>("user", "accounts/me", { token });
    return json(await backend<CreditBalance>(
      "credit", `credit-accounts/${encodeURIComponent(user.id)}`, { token },
    ));
  } catch (error) {
    return errorResponse(error);
  }
}

// Provision only the active identity resolved by the User Service. The browser
// cannot supply an account ID or balance, and repeated requests never add credits.
export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const token = accessToken(request);
    const user = await backend<Profile>("user", "accounts/me", { token });
    if (user.status !== "ACTIVE" || !user.emailVerifiedAt)
      throw new BackendError(403, "Verify your account before using credits.");
    try {
      return json(await backend<CreditBalance>(
        "credit", `credit-accounts/${encodeURIComponent(user.id)}`, { token },
      ));
    } catch (error) {
      if (!(error instanceof BackendError) || error.status !== 404 || error.code !== "ACCOUNT_NOT_FOUND")
        throw error;
    }
    const internalToken = process.env.CREDIT_INTERNAL_API_TOKEN;
    if (!internalToken)
      throw new BackendError(503, "Credit account setup is unavailable. Please try again shortly.");
    return json(await backend<CreditBalance>("credit", "credit-accounts", {
      method: "POST", body: { userId: user.id }, token: internalToken,
    }));
  } catch (error) {
    return errorResponse(error);
  }
}
