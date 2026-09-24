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
