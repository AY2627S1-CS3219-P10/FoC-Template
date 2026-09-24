import {
  EMAIL_AVAILABILITY_RATE_LIMIT_WINDOW_MS,
  type EmailAvailabilityRedisClient,
  MAXIMUM_EMAIL_AVAILABILITY_CHECKS_PER_CLIENT,
  MAXIMUM_EMAIL_AVAILABILITY_CHECKS_PER_EMAIL,
  RedisEmailAvailabilityRateLimiter,
} from '../../../../../src/modules/accounts/infrastructure/messaging/redis-email-availability-rate-limiter.js';

type EvalCall = [string, number, ...Array<number | string>];

class StubRedisClient implements EmailAvailabilityRedisClient {
  evalCalls: EvalCall[] = [];
  quitCalls = 0;

  constructor(public result: unknown) {}

  eval(
    script: string,
    numberOfKeys: number,
    ...arguments_: Array<number | string>
  ): Promise<unknown> {
    this.evalCalls.push([script, numberOfKeys, ...arguments_]);
    return Promise.resolve(this.result);
  }

  quit(): Promise<unknown> {
    this.quitCalls += 1;
    return Promise.resolve('OK');
  }
}

describe('RedisEmailAvailabilityRateLimiter', () => {
  it('atomically limits hashed client and email identifiers', async () => {
    const redis = new StubRedisClient([1, 0]);
    const limiter = new RedisEmailAvailabilityRateLimiter(
      'redis://localhost:6379',
      redis,
    );

    await expect(
      limiter.consume({
        clientIdentifier: '127.0.0.1',
        email: 'student@u.nus.edu',
      }),
    ).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 });

    const call = redis.evalCalls[0];
    expect(call?.[1]).toBe(2);
    expect(call?.[2]).toMatch(
      /^user-service:email-availability:client:[a-f0-9]{64}$/,
    );
    expect(call?.[3]).toMatch(
      /^user-service:email-availability:email:[a-f0-9]{64}$/,
    );
    expect(call).toContain(EMAIL_AVAILABILITY_RATE_LIMIT_WINDOW_MS);
    expect(call).toContain(MAXIMUM_EMAIL_AVAILABILITY_CHECKS_PER_CLIENT);
    expect(call).toContain(MAXIMUM_EMAIL_AVAILABILITY_CHECKS_PER_EMAIL);
    expect(JSON.stringify(call)).not.toContain('127.0.0.1');
    expect(JSON.stringify(call)).not.toContain('student@u.nus.edu');
  });

  it('rounds the retry duration up and closes Redis on shutdown', async () => {
    const redis = new StubRedisClient([0, 42_001]);
    const limiter = new RedisEmailAvailabilityRateLimiter(
      'redis://localhost:6379',
      redis,
    );

    await expect(
      limiter.consume({
        clientIdentifier: '127.0.0.1',
        email: 'student@u.nus.edu',
      }),
    ).resolves.toEqual({ allowed: false, retryAfterSeconds: 43 });

    await limiter.onModuleDestroy();
    expect(redis.quitCalls).toBe(1);
  });
});
