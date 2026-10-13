import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { createHash, timingSafeEqual } from 'node:crypto';
import {
  INTERNAL_CALLER_METADATA,
  type InternalCaller,
} from './internal-caller.decorator';

@Injectable()
export class InternalServiceAuthGuard implements CanActivate {
  private readonly expectedDigests: Record<InternalCaller, Buffer>;

  constructor(
    config: ConfigService,
    private readonly reflector: Reflector,
  ) {
    this.expectedDigests = {
      monitoring: this.digest(
        config.getOrThrow<string>('security.internalApiTokens.monitoring'),
      ),
      'order-service': this.digest(
        config.getOrThrow<string>('security.internalApiTokens.orderService'),
      ),
      'user-service': this.digest(
        config.getOrThrow<string>('security.internalApiTokens.userService'),
      ),
    };
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

    const caller = this.reflector.getAllAndOverride<InternalCaller>(
      INTERNAL_CALLER_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (!caller) {
      throw new ForbiddenException(
        'The endpoint has no internal caller authorization policy',
      );
    }

    if (
      !timingSafeEqual(this.digest(match[1]), this.expectedDigests[caller])
    ) {
      throw new ForbiddenException('The service token is not authorized');
    }

    return true;
  }

  private digest(value: string): Buffer {
    return createHash('sha256').update(value, 'utf8').digest();
  }
}
