/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of route code (GET).
 * Author review: Validated GET request handlers, parameter handling, and returned values; edited handler naming and formatting.
 */

import { NextRequest } from "next/server";
import {
  accessToken,
  backend,
  BackendError,
  errorResponse,
  json,
} from "@/services/backend.server";
import type { CourierRatingSummary } from "@/services/contracts";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ courierId: string }> },
) {
  try {
    const token = accessToken(request);
    const { courierId } = await context.params;
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        courierId,
      )
    )
      throw new BackendError(400, "Invalid courier identifier.");
    return json(
      await backend<CourierRatingSummary>(
        "order",
        `couriers/${courierId}/rating-summary`,
        { token },
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
