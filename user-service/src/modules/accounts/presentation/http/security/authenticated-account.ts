/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of authenticated account code (AUTHENTICATED_ACCOUNT_REQUEST_PROPERTY, CurrentAccount).
 * Author review: Validated AUTHENTICATED_ACCOUNT_REQUEST_PROPERTY, CurrentAccount existing type members and constant values in user-service/authenticated-account.ts; edited naming and formatting for readability.
 */

import {
  createParamDecorator,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

import type { AuthenticatedAccount } from '../../../application/ports/authentication-repository.port.js';

export const AUTHENTICATED_ACCOUNT_REQUEST_PROPERTY = 'authenticatedAccount';

interface AuthenticatedRequest {
  authenticatedAccount?: AuthenticatedAccount;
}

export const CurrentAccount = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedAccount => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.authenticatedAccount) {
      throw new UnauthorizedException({
        code: 'ACCESS_TOKEN_INVALID_OR_EXPIRED',
        message: 'Access token is invalid or expired.',
        statusCode: 401,
      });
    }

    return request.authenticatedAccount;
  },
);
