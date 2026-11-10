/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of route code (GET).
 * Author review: Validated GET request handlers, parameter handling, and returned values; edited handler naming and formatting (web-app/src/app/api/suppliers/route.ts).
 */

import { NextRequest } from "next/server";
import {
  accessToken,
  backend,
  errorResponse,
  json,
} from "@/services/backend.server";
import type { Supplier } from "@/services/contracts";

export async function GET(request: NextRequest) {
  try {
    return json(
      await backend<Supplier[]>("supplier", "suppliers", {
        token: accessToken(request),
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
