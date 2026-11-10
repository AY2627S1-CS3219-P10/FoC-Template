/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of public endpoint rate limiter port code (PUBLIC_ENDPOINT_RATE_LIMITER, PublicEndpoint, PublicEndpointRateLimitInput).
 * Author review: Checked existing PUBLIC_ENDPOINT_RATE_LIMITER, PublicEndpoint parameter and return types against their callers; edited type declaration layout and member naming.
 */

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
