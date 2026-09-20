import { createHash } from 'node:crypto';

import {
  RedisContainer,
  type StartedRedisContainer,
} from '@testcontainers/redis';

import {
  MAXIMUM_VERIFICATION_EMAIL_RESENDS_PER_WINDOW,
  RedisVerificationEmailResendRateLimiter,
} from '../../../src/modules/accounts/infrastructure/messaging/redis-verification-email-resend-rate-limiter.js';

const EMAIL = 'student@u.nus.edu';

describe('RedisVerificationEmailResendRateLimiter', () => {
  let container: StartedRedisContainer;
  let limiter: RedisVerificationEmailResendRateLimiter;

  beforeAll(async () => {
    container = await new RedisContainer('redis:8-alpine').start();
    limiter = new RedisVerificationEmailResendRateLimiter(
      container.getConnectionUrl(),
    );
  });

  afterAll(async () => {
    await limiter?.onModuleDestroy();
    await container?.stop();
  });

  beforeEach(async () => {
    await container.executeCliCmd('FLUSHDB');
  });

  it('atomically enforces the resend cooldown', async () => {
    await expect(limiter.consume(EMAIL)).resolves.toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });

    const secondRequest = await limiter.consume(EMAIL);

    expect(secondRequest.allowed).toBe(false);
    expect(secondRequest.retryAfterSeconds).toBeGreaterThan(0);
    expect(secondRequest.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('enforces the hourly limit after cooldowns expire', async () => {
    const emailHash = createHash('sha256').update(EMAIL).digest('hex');
    const cooldownKey = `user-service:verification-email-resend:cooldown:${emailHash}`;

    for (
      let request = 0;
      request < MAXIMUM_VERIFICATION_EMAIL_RESENDS_PER_WINDOW;
      request += 1
    ) {
      await expect(limiter.consume(EMAIL)).resolves.toMatchObject({
        allowed: true,
      });
      await container.executeCliCmd('DEL', [cooldownKey]);
    }

    const requestOverLimit = await limiter.consume(EMAIL);

    expect(requestOverLimit.allowed).toBe(false);
    expect(requestOverLimit.retryAfterSeconds).toBeGreaterThan(0);
    expect(requestOverLimit.retryAfterSeconds).toBeLessThanOrEqual(3600);
  });
});
