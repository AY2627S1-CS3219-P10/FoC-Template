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
