import { createHash } from 'node:crypto';

import type { OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

import type {
  EmailAvailabilityRateLimitDecision,
  EmailAvailabilityRateLimitInput,
  EmailAvailabilityRateLimiterPort,
} from '../../application/ports/email-availability-rate-limiter.port.js';

export const EMAIL_AVAILABILITY_RATE_LIMIT_WINDOW_MS = 60 * 1000;
export const MAXIMUM_EMAIL_AVAILABILITY_CHECKS_PER_CLIENT = 30;
export const MAXIMUM_EMAIL_AVAILABILITY_CHECKS_PER_EMAIL = 5;

const CONSUME_RATE_LIMIT_SCRIPT = `
local clientCount = tonumber(redis.call('GET', KEYS[1]) or '0')
local emailCount = tonumber(redis.call('GET', KEYS[2]) or '0')

if clientCount >= tonumber(ARGV[2]) or emailCount >= tonumber(ARGV[3]) then
  local clientTtl = redis.call('PTTL', KEYS[1])
  local emailTtl = redis.call('PTTL', KEYS[2])
  return {0, math.max(clientTtl, emailTtl, 1)}
end

local nextClientCount = redis.call('INCR', KEYS[1])
if nextClientCount == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end

local nextEmailCount = redis.call('INCR', KEYS[2])
if nextEmailCount == 1 then
  redis.call('PEXPIRE', KEYS[2], ARGV[1])
end

return {1, 0}
`;

export interface EmailAvailabilityRedisClient {
  eval(
    script: string,
    numberOfKeys: number,
    ...arguments_: Array<number | string>
  ): Promise<unknown>;
  quit(): Promise<unknown>;
}

export class RedisEmailAvailabilityRateLimiter
  implements EmailAvailabilityRateLimiterPort, OnModuleDestroy
{
  private readonly redis: EmailAvailabilityRedisClient;

  constructor(redisUrl: string, redis?: EmailAvailabilityRedisClient) {
    this.redis =
      redis ??
      new Redis(redisUrl, {
        enableReadyCheck: true,
        lazyConnect: true,
        maxRetriesPerRequest: 3,
      });
  }

  async consume(
    input: EmailAvailabilityRateLimitInput,
  ): Promise<EmailAvailabilityRateLimitDecision> {
    const clientHash = this.hash(input.clientIdentifier);
    const emailHash = this.hash(input.email);
    const result = await this.redis.eval(
      CONSUME_RATE_LIMIT_SCRIPT,
      2,
      `user-service:email-availability:client:${clientHash}`,
      `user-service:email-availability:email:${emailHash}`,
      EMAIL_AVAILABILITY_RATE_LIMIT_WINDOW_MS,
      MAXIMUM_EMAIL_AVAILABILITY_CHECKS_PER_CLIENT,
      MAXIMUM_EMAIL_AVAILABILITY_CHECKS_PER_EMAIL,
    );

    if (!Array.isArray(result) || result.length !== 2) {
      throw new Error(
        'Redis returned an invalid email availability rate-limit result.',
      );
    }

    const allowed = Number(result[0]) === 1;
    const retryAfterMilliseconds = Number(result[1]);

    if (!Number.isFinite(retryAfterMilliseconds)) {
      throw new Error(
        'Redis returned an invalid email availability retry duration.',
      );
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

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
