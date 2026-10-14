import {
  PUBLIC_ENDPOINT_RATE_LIMIT_POLICIES,
  type PublicEndpointRedisClient,
  RedisPublicEndpointRateLimiter,
} from '../../../../../src/modules/accounts/infrastructure/messaging/redis-public-endpoint-rate-limiter.js';

type EvalCall = [string, number, ...Array<number | string>];

class StubRedisClient implements PublicEndpointRedisClient {
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

describe('RedisPublicEndpointRateLimiter', () => {
  it('atomically limits hashed client and subject identifiers', async () => {
    const redis = new StubRedisClient([1, 0]);
    const limiter = new RedisPublicEndpointRateLimiter(
      'redis://localhost:6379',
      redis,
    );

    await expect(
      limiter.consume({
        clientIdentifier: '127.0.0.1',
        endpoint: 'login',
        subjectIdentifier: 'student@u.nus.edu',
      }),
    ).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 });

    const call = redis.evalCalls[0];
    expect(call?.[1]).toBe(2);
    expect(call?.[2]).toMatch(
      /^user-service:public-endpoint:login:client:[a-f0-9]{64}$/,
    );
    expect(call?.[3]).toMatch(
      /^user-service:public-endpoint:login:subject:[a-f0-9]{64}$/,
    );
    expect(call).toContain(PUBLIC_ENDPOINT_RATE_LIMIT_POLICIES.login.windowMs);
    expect(call).toContain(
      PUBLIC_ENDPOINT_RATE_LIMIT_POLICIES.login.clientLimit,
    );
    expect(call).toContain(
      PUBLIC_ENDPOINT_RATE_LIMIT_POLICIES.login.subjectLimit,
    );
    expect(JSON.stringify(call)).not.toContain('127.0.0.1');
    expect(JSON.stringify(call)).not.toContain('student@u.nus.edu');
  });

  it('rounds retry time up and closes Redis on shutdown', async () => {
    const redis = new StubRedisClient([0, 60_001]);
    const limiter = new RedisPublicEndpointRateLimiter(
      'redis://localhost:6379',
      redis,
    );

    await expect(
      limiter.consume({
        clientIdentifier: '127.0.0.1',
        endpoint: 'register',
        subjectIdentifier: 'student@u.nus.edu',
      }),
    ).resolves.toEqual({ allowed: false, retryAfterSeconds: 61 });

    await limiter.onModuleDestroy();
    expect(redis.quitCalls).toBe(1);
  });
});
