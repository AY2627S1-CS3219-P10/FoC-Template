import { createHash } from 'node:crypto';

import type { OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

import type {
  RateLimitDecision,
  VerificationEmailResendRateLimiterPort,
} from '../../application/ports/verification-email-resend-rate-limiter.port.js';

export const VERIFICATION_EMAIL_RESEND_COOLDOWN_MS = 60 * 1000;
export const VERIFICATION_EMAIL_RESEND_WINDOW_MS = 60 * 60 * 1000;
export const MAXIMUM_VERIFICATION_EMAIL_RESENDS_PER_WINDOW = 5;

const CONSUME_RATE_LIMIT_SCRIPT = `
local cooldownTtl = redis.call('PTTL', KEYS[1])
if cooldownTtl > 0 then
  return {0, cooldownTtl}
end

local currentCount = tonumber(redis.call('GET', KEYS[2]) or '0')
if currentCount >= tonumber(ARGV[3]) then
  local windowTtl = redis.call('PTTL', KEYS[2])
  if windowTtl > 0 then
    return {0, windowTtl}
  end
  redis.call('DEL', KEYS[2])
end

redis.call('SET', KEYS[1], '1', 'PX', ARGV[1])
local nextCount = redis.call('INCR', KEYS[2])
if nextCount == 1 then
  redis.call('PEXPIRE', KEYS[2], ARGV[2])
end

return {1, 0}
`;

export interface RedisRateLimitClient {
  eval(
    script: string,
    numberOfKeys: number,
    ...arguments_: Array<number | string>
  ): Promise<unknown>;
  quit(): Promise<unknown>;
}

export class RedisVerificationEmailResendRateLimiter
  implements VerificationEmailResendRateLimiterPort, OnModuleDestroy
{
  private readonly redis: RedisRateLimitClient;

  constructor(redisUrl: string, redis?: RedisRateLimitClient) {
    this.redis =
      redis ??
      new Redis(redisUrl, {
        enableReadyCheck: true,
        lazyConnect: true,
        maxRetriesPerRequest: 3,
      });
  }

  async consume(identifier: string): Promise<RateLimitDecision> {
    const identifierHash = createHash('sha256')
      .update(identifier)
      .digest('hex');
    const result = await this.redis.eval(
      CONSUME_RATE_LIMIT_SCRIPT,
      2,
      `user-service:verification-email-resend:cooldown:${identifierHash}`,
      `user-service:verification-email-resend:window:${identifierHash}`,
      VERIFICATION_EMAIL_RESEND_COOLDOWN_MS,
      VERIFICATION_EMAIL_RESEND_WINDOW_MS,
      MAXIMUM_VERIFICATION_EMAIL_RESENDS_PER_WINDOW,
    );

    if (!Array.isArray(result) || result.length !== 2) {
      throw new Error('Redis returned an invalid resend rate-limit result.');
    }

    const allowed = Number(result[0]) === 1;
    const retryAfterMilliseconds = Number(result[1]);

    if (!Number.isFinite(retryAfterMilliseconds)) {
      throw new Error('Redis returned an invalid resend retry duration.');
    }

    return {
      allowed,
      retryAfterSeconds: allowed
        ? 0
        : Math.max(1, Math.ceil(retryAfterMilliseconds / 1000)),
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
