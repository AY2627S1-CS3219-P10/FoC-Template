export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface VerificationEmailResendRateLimiterPort {
  consume(identifier: string): Promise<RateLimitDecision>;
}
