import {
  MAXIMUM_VERIFICATION_EMAIL_RESENDS_PER_WINDOW,
  type RedisRateLimitClient,
  RedisVerificationEmailResendRateLimiter,
  VERIFICATION_EMAIL_RESEND_COOLDOWN_MS,
  VERIFICATION_EMAIL_RESEND_WINDOW_MS,
} from '../../../../../src/modules/accounts/infrastructure/messaging/redis-verification-email-resend-rate-limiter.js';

type EvalCall = [string, number, ...Array<number | string>];

class StubRedisRateLimitClient implements RedisRateLimitClient {
  readonly evalCalls: EvalCall[] = [];
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

describe('RedisVerificationEmailResendRateLimiter', () => {
  it('atomically applies the cooldown and hourly limit without exposing email keys', async () => {
    const redis = new StubRedisRateLimitClient([1, 0]);
    const limiter = new RedisVerificationEmailResendRateLimiter(
      'redis://localhost:6379',
      redis,
    );

    await expect(limiter.consume('student@u.nus.edu')).resolves.toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
    expect(redis.evalCalls).toHaveLength(1);
    const call = redis.evalCalls[0];
    expect(call?.[1]).toBe(2);
    expect(call?.[2]).toMatch(
      /^user-service:verification-email-resend:cooldown:[a-f0-9]{64}$/,
    );
    expect(call?.[3]).toMatch(
      /^user-service:verification-email-resend:window:[a-f0-9]{64}$/,
    );
    expect(call).toContain(VERIFICATION_EMAIL_RESEND_COOLDOWN_MS);
    expect(call).toContain(VERIFICATION_EMAIL_RESEND_WINDOW_MS);
    expect(call).toContain(MAXIMUM_VERIFICATION_EMAIL_RESENDS_PER_WINDOW);
    expect(JSON.stringify(call)).not.toContain('student@u.nus.edu');
  });

  it('rounds the Redis retry duration up to whole seconds', async () => {
    const redis = new StubRedisRateLimitClient([0, 42_001]);
    const limiter = new RedisVerificationEmailResendRateLimiter(
      'redis://localhost:6379',
      redis,
    );

    await expect(limiter.consume('student@u.nus.edu')).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 43,
    });
  });

  it('closes its Redis connection during shutdown', async () => {
    const redis = new StubRedisRateLimitClient([1, 0]);
    const limiter = new RedisVerificationEmailResendRateLimiter(
      'redis://localhost:6379',
      redis,
    );

    await limiter.onModuleDestroy();

    expect(redis.quitCalls).toBe(1);
  });
});
