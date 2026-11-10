import { NextRequest } from "next/server";
import {
  accessToken,
  backend,
  BackendError,
  errorResponse,
  json,
} from "@/services/backend.server";
import type { Errand, Profile } from "@/services/contracts";

const PAGE_SIZE = 100;
const MAX_OFFSET = 10_000;
const IDENTITY_BATCH_SIZE = 20;

async function disputedErrands(token: string) {
  const disputes: Errand[] = [];
  for (let offset = 0; offset <= MAX_OFFSET; offset += PAGE_SIZE) {
    const page = await backend<Errand[]>(
      "order",
      `errands/manage?limit=${PAGE_SIZE}&offset=${offset}&sort=newest`,
      { token },
    );
    disputes.push(
      ...page.filter((errand) =>
        ["DISPUTED", "RESOLVED"].includes(errand.status),
      ),
    );
    if (page.length < PAGE_SIZE) return disputes;
  }
  throw new BackendError(
    503,
    "There are too many errands to load a complete dispute list. Please try again after server-side filtering is available.",
    "DISPUTE_LIST_LIMIT_EXCEEDED",
  );
}

async function withUsernames(errands: Errand[], token: string) {
  const ids = [
    ...new Set(
      errands.flatMap((errand) =>
        errand.courierId
          ? [errand.requesterId, errand.courierId]
          : [errand.requesterId],
      ),
    ),
  ];
  const usernames = new Map<string, string | null>();
  for (let start = 0; start < ids.length; start += IDENTITY_BATCH_SIZE) {
    const batch = ids.slice(start, start + IDENTITY_BATCH_SIZE);
    await Promise.all(
      batch.map(async (id) => {
        try {
          const identity = await backend<{ id: string; username: string }>(
            "user",
            `accounts/${encodeURIComponent(id)}/identity`,
            { token },
          );
          usernames.set(
            id,
            identity.id === id && identity.username.trim()
              ? identity.username
              : null,
          );
        } catch {
          usernames.set(id, null);
        }
      }),
    );
  }
  return errands.map((errand) => ({
    ...errand,
    requesterUsername: usernames.get(errand.requesterId) ?? null,
    courierUsername: errand.courierId
      ? usernames.get(errand.courierId) ?? null
      : null,
  }));
}

export async function GET(request: NextRequest) {
  try {
    const token = accessToken(request);
    const profile = await backend<Profile>("user", "accounts/me", { token });
    if (!profile.isAdmin)
      throw new BackendError(403, "Administrator privileges are required.");
    return json(await withUsernames(await disputedErrands(token), token));
  } catch (error) {
    return errorResponse(error);
  }
}
