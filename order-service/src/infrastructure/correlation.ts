/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of correlation code (CORRELATION_HEADER, correlationIdFor, currentCorrelationId).
 * Author review: Validated CORRELATION_HEADER, correlationIdFor existing type members and constant values in order-service/correlation.ts; edited naming and formatting for readability.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

/** Same header credit-service reads and echoes (credit-service CorrelationIdInterceptor). */
export const CORRELATION_HEADER = 'x-correlation-id';
const VALID = /^[\w.:-]{1,128}$/;
const CACHED = Symbol('correlationId');
const storage = new AsyncLocalStorage<string>();

type CorrelatedRequest = IncomingMessage & { [CACHED]?: string };

/** Reuses a well-formed inbound id, otherwise generates one; stable per request. */
export function correlationIdFor(request: IncomingMessage): string {
  const req = request as CorrelatedRequest;
  if (!req[CACHED]) {
    const supplied = req.headers[CORRELATION_HEADER];
    req[CACHED] =
      typeof supplied === 'string' && VALID.test(supplied)
        ? supplied
        : randomUUID();
  }
  return req[CACHED];
}

export function currentCorrelationId(): string | undefined {
  return storage.getStore();
}

export function withCorrelationId<T>(id: string, work: () => T): T {
  return storage.run(id, work);
}
