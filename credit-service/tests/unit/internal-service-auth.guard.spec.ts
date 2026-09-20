import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { InternalServiceAuthGuard } from '../../src/api/internal-service-auth.guard';

describe('InternalServiceAuthGuard', () => {
  const token = 'unit-test-credit-service-token-32-characters';
  let guard: InternalServiceAuthGuard;

  beforeEach(() => {
    const config = {
      getOrThrow: jest.fn().mockReturnValue(token),
    } as unknown as ConfigService;
    guard = new InternalServiceAuthGuard(config);
  });

  const context = (authorization?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ headers: { authorization } }),
      }),
    }) as unknown as ExecutionContext;

  it('accepts the configured bearer token', () => {
    expect(guard.canActivate(context(`Bearer ${token}`))).toBe(true);
  });

  it.each([undefined, '', 'Basic abc', 'Bearer', 'Bearer one two'])(
    'rejects missing or malformed authorization: %s',
    (authorization) => {
      expect(() => guard.canActivate(context(authorization))).toThrow(
        UnauthorizedException,
      );
    },
  );

  it('rejects a different well-formed token', () => {
    expect(() =>
      guard.canActivate(context('Bearer unauthorized-service-token')),
    ).toThrow(ForbiddenException);
  });
});
