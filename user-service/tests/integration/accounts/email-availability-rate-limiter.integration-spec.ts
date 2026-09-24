import {
  RedisContainer,
  type StartedRedisContainer,
} from '@testcontainers/redis';

import {
  MAXIMUM_EMAIL_AVAILABILITY_CHECKS_PER_CLIENT,
  MAXIMUM_EMAIL_AVAILABILITY_CHECKS_PER_EMAIL,
  RedisEmailAvailabilityRateLimiter,
} from '../../../src/modules/accounts/infrastructure/messaging/redis-email-availability-rate-limiter.js';

describe('RedisEmailAvailabilityRateLimiter', () => {
  let container: StartedRedisContainer;
  let limiter: RedisEmailAvailabilityRateLimiter;

  beforeAll(async () => {
    container = await new RedisContainer('redis:8-alpine').start();
    limiter = new RedisEmailAvailabilityRateLimiter(
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

  it('enforces the per-email limit across different clients', async () => {
    for (
      let request = 0;
      request < MAXIMUM_EMAIL_AVAILABILITY_CHECKS_PER_EMAIL;
      request += 1
    ) {
      await expect(
        limiter.consume({
          clientIdentifier: `client-${request}`,
          email: 'student@u.nus.edu',
        }),
      ).resolves.toMatchObject({ allowed: true });
    }

    await expect(
      limiter.consume({
        clientIdentifier: 'one-more-client',
        email: 'student@u.nus.edu',
      }),
    ).resolves.toMatchObject({ allowed: false });
  });

  it('enforces the per-client limit across different emails', async () => {
    for (
      let request = 0;
      request < MAXIMUM_EMAIL_AVAILABILITY_CHECKS_PER_CLIENT;
      request += 1
    ) {
      await expect(
        limiter.consume({
          clientIdentifier: 'one-client',
          email: `student${request}@u.nus.edu`,
        }),
      ).resolves.toMatchObject({ allowed: true });
    }

    const decision = await limiter.consume({
      clientIdentifier: 'one-client',
      email: 'over-limit@u.nus.edu',
    });
    expect(decision.allowed).toBe(false);
    expect(decision.retryAfterSeconds).toBeGreaterThan(0);
    expect(decision.retryAfterSeconds).toBeLessThanOrEqual(60);
  });
});
