/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of errand identity server code (withCourierUsername).
 * Author review: Validated withCourierUsername existing type members and constant values in web-app/errand-identity.server.ts; edited naming and formatting for readability.
 */

import "server-only";
import { backend } from "./backend.server";
import type { Errand, ErrandOperation } from "./contracts";

// Resolve presentation data only after Order Service has authorized the errand.
// A missing identity must not turn a successful lifecycle action into an error.
export async function withCourierUsername<T extends Errand | ErrandOperation>(result: T, token: string): Promise<T> {
  const value: Errand | ErrandOperation = result;
  const errand = "courierId" in value ? value : value.errand;
  if (!errand?.courierId) return result;
  let courierUsername: string | null = null;
  try {
    const identity = await backend<{ id: string; username: string }>("user", `accounts/${encodeURIComponent(errand.courierId)}/identity`, { token });
    if (identity.id === errand.courierId && typeof identity.username === "string" && identity.username.trim()) courierUsername = identity.username;
  } catch {
    // Keep the authorized errand usable if public identity lookup is unavailable.
  }
  const enriched = { ...errand, courierUsername };
  return ("operationId" in result ? { ...result, errand: enriched } : enriched) as T;
}
