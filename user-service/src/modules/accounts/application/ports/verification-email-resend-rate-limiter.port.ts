/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of verification email resend rate limiter port code (RateLimitDecision, VerificationEmailResendRateLimiterPort).
 * Author review: Checked existing RateLimitDecision, VerificationEmailResendRateLimiterPort parameter and return types against their callers; edited type declaration layout and member naming.
 */

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface VerificationEmailResendRateLimiterPort {
  consume(identifier: string): Promise<RateLimitDecision>;
}
