export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}

export async function request<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/${path}`, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      0,
      "Unable to connect. Check your connection and try again.",
    );
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      response.status,
      data.message || "The request could not be completed.",
      data.code,
      Number(response.headers.get("Retry-After")) || undefined,
    );
  return data as T;
}

// Refresh tokens are single-use. Serialize rotation, login, and logout across tabs.
let queue: Promise<unknown> = Promise.resolve();
export function sessionLock<T>(operation: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks)
    return navigator.locks.request("foc-session", operation);
  const next = queue.then(operation, operation);
  queue = next.catch(() => undefined);
  return next;
}

export async function authenticatedRequest<T>(path: string): Promise<T> {
  try {
    return await request<T>(path);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    return sessionLock(async () => {
      // Another tab may already have rotated the token while this tab was waiting.
      try {
        return await request<T>(path);
      } catch (retryError) {
        if (!(retryError instanceof ApiError) || retryError.status !== 401)
          throw retryError;
        // Do not refresh a valid user token just because supplier configuration rejects it.
        if (path !== "auth/session") {
          try {
            await request("auth/session");
          } catch (sessionError) {
            if (
              !(sessionError instanceof ApiError) ||
              sessionError.status !== 401
            )
              throw sessionError;
            await request("auth/refresh", {});
            return request<T>(path);
          }
          throw new ApiError(
            403,
            "The supplier service could not authorize your account. Please contact the administrator.",
          );
        }
        await request("auth/refresh", {});
        return request<T>(path);
      }
    });
  }
}
