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
