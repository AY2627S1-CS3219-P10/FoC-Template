/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of email availability rate limiter port code (EmailAvailabilityRateLimitInput, EmailAvailabilityRateLimitDecision, EmailAvailabilityRateLimiterPort).
 * Author review: Checked existing EmailAvailabilityRateLimitInput, EmailAvailabilityRateLimitDecision parameter and return types against their callers; edited type declaration layout and member naming.
 */

export interface EmailAvailabilityRateLimitInput {
  clientIdentifier: string;
  email: string;
}

export interface EmailAvailabilityRateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface EmailAvailabilityRateLimiterPort {
  consume(
    input: EmailAvailabilityRateLimitInput,
  ): Promise<EmailAvailabilityRateLimitDecision>;
}
