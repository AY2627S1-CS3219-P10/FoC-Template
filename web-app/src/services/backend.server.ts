import "server-only";
import { NextRequest, NextResponse } from "next/server";
import type { Authentication } from "./contracts";

export const ACCESS_COOKIE = "foc_access";
export const REFRESH_COOKIE = "foc_refresh";

export class BackendError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public retryAfter?: string,
  ) {
    super(message);
  }
}

export async function backend<T>(
  service: "user" | "supplier",
  path: string,
  options: { method?: string; body?: unknown; token?: string } = {},
): Promise<T> {
  const origin =
    service === "user"
      ? process.env.USER_SERVICE_URL || "http://127.0.0.1:3001"
      : process.env.SUPPLIER_SERVICE_URL || "http://127.0.0.1:3002";
  let response: Response;
  try {
    response = await fetch(`${origin.replace(/\/$/, "")}/api/${path}`, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new BackendError(
      503,
      `The ${service === "user" ? "account" : "supplier"} service is unavailable. Please try again shortly.`,
      "SERVICE_UNAVAILABLE",
    );
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    // Never relay infrastructure errors, stack traces, or upstream headers.
    const message =
      response.status < 500 && typeof data.message === "string"
        ? data.message
        : response.status < 500 && Array.isArray(data.message)
          ? data.message
              .filter((item: unknown) => typeof item === "string")
              .join(" ")
          : "The request could not be completed. Please try again.";
    throw new BackendError(
      response.status >= 500 ? 503 : response.status,
      message,
      typeof data.code === "string" ? data.code : undefined,
      response.headers.get("retry-after") ?? undefined,
    );
  }
  if (response.status === 204) return undefined as T;
  try {
    return (await response.json()) as T;
  } catch {
    throw new BackendError(502, "The service returned an unexpected response.");
  }
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
  });
}

export function errorResponse(error: unknown) {
  const failure =
    error instanceof BackendError
      ? error
      : new BackendError(500, "Something went wrong. Please try again.");
  const response = json(
    { message: failure.message, code: failure.code },
    failure.status,
  );
  if (failure.retryAfter && /^\d+$/.test(failure.retryAfter))
    response.headers.set("Retry-After", failure.retryAfter);
  return response;
}

export function requireSameOrigin(request: NextRequest) {
  // Next.js can normalize request.url to localhost behind its internal server.
  // Host retains the actual browser-facing host/port for local development.
  const expected = process.env.APP_ORIGIN
    ? new URL(process.env.APP_ORIGIN).origin
    : `${request.nextUrl.protocol}//${request.headers.get("host")}`;
  if (
    request.headers.get("origin") !== expected ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    throw new BackendError(403, "This request must come from the application.");
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    throw new BackendError(415, "A JSON request is required.");
  }
}

export async function readFields(request: NextRequest, fields: string[]) {
  const raw = await request.text();
  if (raw.length > 8192)
    throw new BackendError(413, "The request is too large.");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new BackendError(400, "Invalid request.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new BackendError(400, "Invalid request.");
  const input = body as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const field of fields) {
    if (typeof input[field] !== "string" || !input[field])
      throw new BackendError(400, `${field} is required.`);
    result[field] = input[field];
  }
  return result;
}

export function setSession(
  response: NextResponse,
  request: NextRequest,
  auth: Authentication,
) {
  if (
    !auth.accessToken ||
    !auth.refreshToken ||
    !Number.isFinite(auth.expiresIn) ||
    auth.expiresIn <= 0
  ) {
    throw new BackendError(
      502,
      "The account service returned an invalid session.",
    );
  }
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure:
      new URL(process.env.APP_ORIGIN || request.url).protocol === "https:",
    path: "/api",
  };
  response.cookies.set(ACCESS_COOKIE, auth.accessToken, {
    ...options,
    maxAge: auth.expiresIn,
  });
  response.cookies.set(REFRESH_COOKIE, auth.refreshToken, {
    ...options,
    maxAge: 30 * 24 * 60 * 60,
  });
}

export function clearSession(response: NextResponse) {
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE])
    response.cookies.set(name, "", {
      path: "/api",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 0,
    });
  return response;
}

export function accessToken(request: NextRequest) {
  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!token)
    throw new BackendError(
      401,
      "Please log in to continue.",
      "SESSION_REQUIRED",
    );
  return token;
}
