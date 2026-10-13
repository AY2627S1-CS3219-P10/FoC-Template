import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
  INTERNAL_CALLER_METADATA,
  type InternalCaller,
} from '../../src/api/internal-caller.decorator';
import { InternalServiceAuthGuard } from '../../src/api/internal-service-auth.guard';

describe('InternalServiceAuthGuard', () => {
  const tokens: Record<InternalCaller, string> = {
    monitoring: 'unit-test-monitoring-token-at-least-32-characters',
    'order-service': 'unit-test-order-token-at-least-32-characters',
    'user-service': 'unit-test-user-token-at-least-32-characters',
  };
  let guard: InternalServiceAuthGuard;

  beforeEach(() => {
    const config = {
      getOrThrow: jest.fn((key: string) => {
        const values: Record<string, string> = {
          'security.internalApiTokens.monitoring': tokens.monitoring,
          'security.internalApiTokens.orderService': tokens['order-service'],
          'security.internalApiTokens.userService': tokens['user-service'],
        };
        return values[key];
      }),
    } as unknown as ConfigService;
    guard = new InternalServiceAuthGuard(config, new Reflector());
  });

  const context = (
    authorization?: string,
    caller: InternalCaller | null = 'order-service',
  ) => {
    const handler = () => undefined;
    if (caller !== null) {
      Reflect.defineMetadata(INTERNAL_CALLER_METADATA, caller, handler);
    }
    return {
      switchToHttp: () => ({
        getRequest: () => ({ headers: { authorization } }),
      }),
      getHandler: () => handler,
      getClass: () => class TestController {},
    } as unknown as ExecutionContext;
  };

  it('accepts the configured bearer token', () => {
    expect(
      guard.canActivate(context(`Bearer ${tokens['order-service']}`)),
    ).toBe(true);
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

  it('rejects a valid token belonging to a different internal caller', () => {
    expect(() =>
      guard.canActivate(
        context(`Bearer ${tokens['user-service']}`, 'order-service'),
      ),
    ).toThrow(ForbiddenException);
  });

  it('fails closed when an endpoint has no caller policy', () => {
    expect(() =>
      guard.canActivate(
        context(`Bearer ${tokens['order-service']}`, null),
      ),
    ).toThrow(ForbiddenException);
  });
});
