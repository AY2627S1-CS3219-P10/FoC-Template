import { HttpException, HttpStatus } from '@nestjs/common';

import { PublicEndpointRateLimitError } from '../../../application/errors/public-endpoint-rate-limit.error.js';
import type {
  PublicEndpoint,
  PublicEndpointRateLimiterPort,
} from '../../../application/ports/public-endpoint-rate-limiter.port.js';

interface HeaderResponse {
  header(name: string, value: string): unknown;
}

export async function enforcePublicEndpointRateLimit(
  rateLimiter: PublicEndpointRateLimiterPort,
  reply: HeaderResponse,
  endpoint: PublicEndpoint,
  clientIdentifier: string,
  subjectIdentifier: string,
): Promise<void> {
  const decision = await rateLimiter.consume({
    clientIdentifier,
    endpoint,
    subjectIdentifier,
  });
  if (decision.allowed) return;

  const error = new PublicEndpointRateLimitError(
    endpoint,
    decision.retryAfterSeconds,
  );
  reply.header('Retry-After', error.retryAfterSeconds.toString());
  throw new HttpException(
    {
      code: error.code,
      message: error.message,
      retryAfterSeconds: error.retryAfterSeconds,
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}
