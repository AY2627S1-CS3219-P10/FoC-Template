import { createHash } from 'node:crypto';

import type { OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

import type {
  PublicEndpoint,
  PublicEndpointRateLimitDecision,
  PublicEndpointRateLimitInput,
  PublicEndpointRateLimiterPort,
} from '../../application/ports/public-endpoint-rate-limiter.port.js';

interface RateLimitPolicy {
  clientLimit: number;
  subjectLimit: number;
  windowMs: number;
}

export const PUBLIC_ENDPOINT_RATE_LIMIT_POLICIES: Record<
  PublicEndpoint,
  RateLimitPolicy
> = {
  login: { clientLimit: 100, subjectLimit: 10, windowMs: 60_000 },
  refresh: { clientLimit: 120, subjectLimit: 20, windowMs: 60_000 },
  register: { clientLimit: 100, subjectLimit: 3, windowMs: 3_600_000 },
  'verify-email': {
    clientLimit: 120,
    subjectLimit: 10,
    windowMs: 600_000,
  },
};

const CONSUME_RATE_LIMIT_SCRIPT = `
local clientCount = tonumber(redis.call('GET', KEYS[1]) or '0')
local subjectCount = tonumber(redis.call('GET', KEYS[2]) or '0')

if clientCount >= tonumber(ARGV[2]) or subjectCount >= tonumber(ARGV[3]) then
  local clientTtl = redis.call('PTTL', KEYS[1])
  local subjectTtl = redis.call('PTTL', KEYS[2])
  return {0, math.max(clientTtl, subjectTtl, 1)}
end

local nextClientCount = redis.call('INCR', KEYS[1])
if nextClientCount == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end

local nextSubjectCount = redis.call('INCR', KEYS[2])
if nextSubjectCount == 1 then
  redis.call('PEXPIRE', KEYS[2], ARGV[1])
end

return {1, 0}
`;

export interface PublicEndpointRedisClient {
  eval(
    script: string,
    numberOfKeys: number,
    ...arguments_: Array<number | string>
  ): Promise<unknown>;
  quit(): Promise<unknown>;
}

export class RedisPublicEndpointRateLimiter
  implements PublicEndpointRateLimiterPort, OnModuleDestroy
{
  private readonly redis: PublicEndpointRedisClient;

  constructor(redisUrl: string, redis?: PublicEndpointRedisClient) {
    this.redis =
      redis ??
      new Redis(redisUrl, {
        enableReadyCheck: true,
        lazyConnect: true,
        maxRetriesPerRequest: 3,
      });
  }

  async consume(
    input: PublicEndpointRateLimitInput,
  ): Promise<PublicEndpointRateLimitDecision> {
    const policy = PUBLIC_ENDPOINT_RATE_LIMIT_POLICIES[input.endpoint];
    const namespace = `user-service:public-endpoint:${input.endpoint}`;
    const result = await this.redis.eval(
      CONSUME_RATE_LIMIT_SCRIPT,
      2,
      `${namespace}:client:${this.hash(input.clientIdentifier)}`,
      `${namespace}:subject:${this.hash(input.subjectIdentifier)}`,
      policy.windowMs,
      policy.clientLimit,
      policy.subjectLimit,
    );

    if (!Array.isArray(result) || result.length !== 2) {
      throw new Error('Redis returned an invalid public rate-limit result.');
    }

    const allowed = Number(result[0]) === 1;
    const retryAfterMilliseconds = Number(result[1]);
    if (!Number.isFinite(retryAfterMilliseconds)) {
      throw new Error('Redis returned an invalid public retry duration.');
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
