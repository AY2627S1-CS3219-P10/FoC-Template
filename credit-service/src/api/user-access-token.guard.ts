import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { isUUID } from 'class-validator';
import type {
  AuthenticatedPrincipal,
  AuthenticatedRequest,
} from './authenticated-request';

interface AccessTokenClaims {
  sub?: unknown;
  sid?: unknown;
  isAdmin?: unknown;
  exp?: unknown;
  iat?: unknown;
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
      const decoded = this.jwtService.decode(token, { complete: true });
      if (
        !decoded ||
        typeof decoded !== 'object' ||
        !('header' in decoded) ||
        decoded.header.typ !== 'JWT'
      ) {
        throw new Error('Access token has an invalid type');
      }
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
      !isUUID(claims.sub, '4') ||
      typeof claims.sid !== 'string' ||
      !isUUID(claims.sid, '4') ||
      typeof claims.isAdmin !== 'boolean' ||
      typeof claims.iat !== 'number' ||
      !Number.isSafeInteger(claims.iat) ||
      typeof claims.exp !== 'number' ||
      !Number.isSafeInteger(claims.exp) ||
      claims.exp <= claims.iat
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
