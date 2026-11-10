/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of administrator authorization guard code (AdministratorAuthorizationGuard).
 * Author review: Checked AdministratorAuthorizationGuard request checks, accepted credentials, and rejection branches; clarified condition layout and error wording.
 */

import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import type { AuthenticatedAccount } from '../../../application/ports/authentication-repository.port.js';

interface AuthenticatedRequest {
  authenticatedAccount?: AuthenticatedAccount;
}

@Injectable()
export class AdministratorAuthorizationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (request.authenticatedAccount?.isAdmin === true) {
      return true;
    }

    throw new ForbiddenException({
      code: 'ADMINISTRATOR_PRIVILEGES_REQUIRED',
      message: 'Administrator privileges are required.',
      statusCode: 403,
    });
  }
}
