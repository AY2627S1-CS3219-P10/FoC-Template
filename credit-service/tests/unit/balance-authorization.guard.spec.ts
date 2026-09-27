import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { BalanceAuthorizationGuard } from '../../src/api/balance-authorization.guard';

describe('BalanceAuthorizationGuard', () => {
  const guard = new BalanceAuthorizationGuard();
  const context = (request: Record<string, unknown>) =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  it('allows a user to read their own balance', () => {
    expect(
      guard.canActivate(
        context({
          params: { userId: 'user-1' },
          user: { userId: 'user-1', sessionId: 'session', isAdmin: false },
        }),
      ),
    ).toBe(true);
  });

  it('allows an administrator to read another balance', () => {
    expect(
      guard.canActivate(
        context({
          params: { userId: 'user-2' },
          user: { userId: 'admin', sessionId: 'session', isAdmin: true },
        }),
      ),
    ).toBe(true);
  });

  it('rejects a user reading another balance', () => {
    expect(() =>
      guard.canActivate(
        context({
          params: { userId: 'user-2' },
          user: { userId: 'user-1', sessionId: 'session', isAdmin: false },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('rejects a request without an authenticated principal', () => {
    expect(() =>
      guard.canActivate(context({ params: { userId: 'user' } })),
    ).toThrow(UnauthorizedException);
  });
});
