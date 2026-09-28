import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type {
  AuthenticatedPrincipal,
  AuthenticatedRequest,
} from './authenticated-request';

interface AccessTokenClaims {
  sub?: unknown;
  sid?: unknown;
  isAdmin?: unknown;
}

@Injectable()
export class UserAccessTokenGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('A valid access token is required');
    }

    try {
      const claims =
        await this.jwtService.verifyAsync<AccessTokenClaims>(token);
      request.user = this.toPrincipal(claims);
      return true;
    } catch {
      throw new UnauthorizedException('Access token is invalid or expired');
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

  private toPrincipal(claims: AccessTokenClaims): AuthenticatedPrincipal {
    if (
      typeof claims.sub !== 'string' ||
      claims.sub.length === 0 ||
      typeof claims.sid !== 'string' ||
      claims.sid.length === 0 ||
      typeof claims.isAdmin !== 'boolean'
    ) {
      throw new Error('Access token is missing required identity claims');
    }
    return {
      userId: claims.sub,
      sessionId: claims.sid,
      isAdmin: claims.isAdmin,
    };
  }
}
