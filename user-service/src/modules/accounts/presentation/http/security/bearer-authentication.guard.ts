import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { AuthenticationError } from '../../../application/errors/authentication.error.js';
import { AuthenticateAccessTokenUseCase } from '../../../application/use-cases/authenticate-access-token.use-case.js';
import type { AuthenticatedAccount } from '../../../application/ports/authentication-repository.port.js';

interface BearerRequest {
  authenticatedAccount?: AuthenticatedAccount;
  headers: { authorization?: string | string[] };
}

@Injectable()
export class BearerAuthenticationGuard implements CanActivate {
  constructor(
    private readonly authenticateAccessToken: AuthenticateAccessTokenUseCase,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<BearerRequest>();
    const authorization = request.headers.authorization;
    const match =
      typeof authorization === 'string'
        ? /^Bearer\s+(\S+)$/i.exec(authorization)
        : null;

    if (!match?.[1]) {
      this.throwUnauthorized();
    }

    try {
      request.authenticatedAccount = await this.authenticateAccessToken.execute(
        match[1],
      );
      return true;
    } catch (error: unknown) {
      if (error instanceof AuthenticationError) {
        this.throwUnauthorized();
      }

      throw error;
    }
  }

  private throwUnauthorized(): never {
    throw new UnauthorizedException({
      code: 'ACCESS_TOKEN_INVALID_OR_EXPIRED',
      message: 'Access token is invalid or expired.',
      statusCode: 401,
    });
  }
}
