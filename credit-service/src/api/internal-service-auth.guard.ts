import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';
import { createHash, timingSafeEqual } from 'node:crypto';

@Injectable()
export class InternalServiceAuthGuard implements CanActivate {
  private readonly expectedDigest: Buffer;

  constructor(config: ConfigService) {
    this.expectedDigest = this.digest(
      config.getOrThrow<string>('security.internalApiToken'),
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const authorization = request.headers.authorization;

    if (!authorization) {
      throw new UnauthorizedException('Bearer authentication is required');
    }

    const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
    if (!match) {
      throw new UnauthorizedException('Authorization must use a Bearer token');
    }

    if (!timingSafeEqual(this.digest(match[1]), this.expectedDigest)) {
      throw new ForbiddenException('The service token is not authorized');
    }

    return true;
  }

  private digest(value: string): Buffer {
    return createHash('sha256').update(value, 'utf8').digest();
  }
}
