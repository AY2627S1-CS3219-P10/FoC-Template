import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import type { AuthenticatedRequest } from './authenticated-request.js';
import { type AuthenticatedUser, UserRole } from './user-role.js';

interface AccessTokenClaims {
  isAdmin?: unknown;
  sessionId?: unknown;
  userId?: unknown;
}

@Injectable()
export class JwtAuthenticationGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException('A valid access token is required.');
    }

    try {
      const claims =
        await this.jwtService.verifyAsync<AccessTokenClaims>(token);
      request.user = this.toAuthenticatedUser(claims);
      return true;
    } catch {
      throw new UnauthorizedException('Access token is invalid or expired.');
    }
  }

  private extractBearerToken(header: string | undefined): string | undefined {
    if (!header) {
      return undefined;
    }

    const [scheme, token, extra] = header.trim().split(/\s+/);

    if (scheme?.toLowerCase() !== 'bearer' || !token || extra) {
      return undefined;
    }

    return token;
  }

  private toAuthenticatedUser(claims: AccessTokenClaims): AuthenticatedUser {
    if (
      typeof claims.userId !== 'string' ||
      claims.userId.length === 0 ||
      typeof claims.sessionId !== 'string' ||
      claims.sessionId.length === 0 ||
      typeof claims.isAdmin !== 'boolean'
    ) {
      throw new Error('Access token is missing required identity claims.');
    }

    return {
      role: claims.isAdmin ? UserRole.Admin : UserRole.Student,
      sessionId: claims.sessionId,
      userId: claims.userId,
    };
  }
}
