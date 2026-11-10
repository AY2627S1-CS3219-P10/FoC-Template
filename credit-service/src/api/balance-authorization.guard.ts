/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of balance authorization guard code (BalanceAuthorizationGuard).
 * Author review: Checked BalanceAuthorizationGuard request checks, accepted credentials, and rejection branches; clarified condition layout and error wording.
 */

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticatedRequest } from './authenticated-request';

@Injectable()
export class BalanceAuthorizationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) {
      throw new UnauthorizedException('An authenticated user is required');
    }

    const { userId } = request.params as { userId?: unknown };
    if (request.user.isAdmin || request.user.userId === userId) {
      return true;
    }
    throw new ForbiddenException(
      'Users may only read their own credit balance',
    );
  }
}
