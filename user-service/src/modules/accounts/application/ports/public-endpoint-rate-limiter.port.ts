export const PUBLIC_ENDPOINT_RATE_LIMITER = Symbol(
  'PUBLIC_ENDPOINT_RATE_LIMITER',
);

export type PublicEndpoint = 'login' | 'refresh' | 'register' | 'verify-email';

export interface PublicEndpointRateLimitInput {
  clientIdentifier: string;
  endpoint: PublicEndpoint;
  subjectIdentifier: string;
}

export interface PublicEndpointRateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface PublicEndpointRateLimiterPort {
  consume(
    input: PublicEndpointRateLimitInput,
  ): Promise<PublicEndpointRateLimitDecision>;
}
