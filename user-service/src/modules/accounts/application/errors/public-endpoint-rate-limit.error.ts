/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of public endpoint rate limit error code (PublicEndpointRateLimitError).
 * Author review: Checked PublicEndpointRateLimitError error messages and codes PUBLIC_ENDPOINT_RATE_LIMIT_EXCEEDED; standardized exception naming and formatting.
 */

import type { PublicEndpoint } from '../ports/public-endpoint-rate-limiter.port.js';

export class PublicEndpointRateLimitError extends Error {
  readonly code = 'PUBLIC_ENDPOINT_RATE_LIMIT_EXCEEDED';

  constructor(
    public readonly endpoint: PublicEndpoint,
    public readonly retryAfterSeconds: number,
  ) {
    super('Too many requests. Try again later.');
  }
}
