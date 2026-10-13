import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserAccessTokenGuard } from '../../src/api/user-access-token.guard';

describe('UserAccessTokenGuard', () => {
  const secret = 'unit-test-access-token-secret-at-least-32-characters';
  const jwt = new JwtService({
    secret,
    verifyOptions: {
      algorithms: ['HS256'],
      audience: 'foc-api',
      issuer: 'foc-user-service',
    },
  });
  const guard = new UserAccessTokenGuard(jwt);

  const request = (authorization?: string) => ({
    headers: { authorization },
  });
  const context = (value: ReturnType<typeof request>) =>
    ({
      switchToHttp: () => ({ getRequest: () => value }),
    }) as unknown as ExecutionContext;

  const token = (overrides: Record<string, unknown> = {}) =>
    jwt.sign(
      {
        sid: '20000000-0000-4000-8000-000000000001',
        isAdmin: false,
        ...overrides,
      },
      {
        algorithm: 'HS256',
        audience: 'foc-api',
        expiresIn: 900,
        issuer: 'foc-user-service',
        subject: '10000000-0000-4000-8000-000000000001',
      },
    );

  it('authenticates a valid User Service token', async () => {
    const value = request(`Bearer ${token()}`);
    await expect(guard.canActivate(context(value))).resolves.toBe(true);
    expect(value).toHaveProperty('user', {
      userId: '10000000-0000-4000-8000-000000000001',
      sessionId: '20000000-0000-4000-8000-000000000001',
      isAdmin: false,
    });
  });

  it.each([undefined, '', 'Basic value', 'Bearer', 'Bearer one two'])(
    'rejects a missing or malformed token: %s',
    async (authorization) => {
      await expect(
        guard.canActivate(context(request(authorization))),
      ).rejects.toThrow(UnauthorizedException);
    },
  );

  it('rejects tokens without the required claims', async () => {
    await expect(
      guard.canActivate(
        context(request(`Bearer ${token({ sid: undefined })}`)),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects signed tokens without the access-token expiry contract', async () => {
    const noExpiry = jwt.sign(
      {
        sid: '20000000-0000-4000-8000-000000000001',
        isAdmin: false,
      },
      {
        algorithm: 'HS256',
        audience: 'foc-api',
        issuer: 'foc-user-service',
        subject: '10000000-0000-4000-8000-000000000001',
      },
    );
    await expect(
      guard.canActivate(context(request(`Bearer ${noExpiry}`))),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects signed tokens whose subject or session is not a UUID', async () => {
    await expect(
      guard.canActivate(
        context(request(`Bearer ${token({ sid: 'attacker-session' })}`)),
      ),
    ).rejects.toThrow(UnauthorizedException);

    const badSubject = jwt.sign(
      {
        sid: '20000000-0000-4000-8000-000000000001',
        isAdmin: true,
      },
      {
        algorithm: 'HS256',
        audience: 'foc-api',
        expiresIn: 900,
        issuer: 'foc-user-service',
        subject: 'not-a-user-id',
      },
    );
    await expect(
      guard.canActivate(context(request(`Bearer ${badSubject}`))),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a signed JWT with the wrong token type', async () => {
    const wrongType = jwt.sign(
      {
        sid: '20000000-0000-4000-8000-000000000001',
        isAdmin: false,
      },
      {
        algorithm: 'HS256',
        audience: 'foc-api',
        expiresIn: 900,
        header: { alg: 'HS256', typ: 'service+jwt' },
        issuer: 'foc-user-service',
        subject: '10000000-0000-4000-8000-000000000001',
      },
    );
    await expect(
      guard.canActivate(context(request(`Bearer ${wrongType}`))),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an expired token', async () => {
    const expired = jwt.sign(
      { sid: 'session', isAdmin: false },
      {
        algorithm: 'HS256',
        audience: 'foc-api',
        expiresIn: -1,
        issuer: 'foc-user-service',
        subject: 'user',
      },
    );
    await expect(
      guard.canActivate(context(request(`Bearer ${expired}`))),
    ).rejects.toThrow(UnauthorizedException);
  });
});
