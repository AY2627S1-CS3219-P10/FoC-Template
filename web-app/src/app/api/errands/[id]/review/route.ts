/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of route code (GET, POST).
 * Author review: Validated GET, POST request handlers, parameter handling, and returned values; edited handler naming and formatting (web-app/src/app/api/errands/[id]/review/route.ts).
 */

import { NextRequest } from "next/server";
import {
  accessToken,
  backend,
  BackendError,
  errorResponse,
  json,
  requireSameOrigin,
} from "@/services/backend.server";
import type { CourierReview } from "@/services/contracts";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const token = accessToken(request);
    const { id } = await context.params;
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      )
    )
      throw new BackendError(400, "Invalid errand identifier.");
    return json(
      await backend<{ review: CourierReview | null }>(
        "order",
        `errands/${id}/review`,
        { token },
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    requireSameOrigin(request);
    const token = accessToken(request);
    const { id } = await context.params;
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      )
    ) {
      throw new BackendError(400, "Invalid errand identifier.");
    }

    const raw = await request.text();
    if (raw.length > 8192) {
      throw new BackendError(413, "The request is too large.");
    }
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new BackendError(400, "Invalid JSON.");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new BackendError(400, "Invalid review.");
    }

    return json(
      await backend<CourierReview>("order", `errands/${id}/review`, {
        method: "POST",
        token,
        body,
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
