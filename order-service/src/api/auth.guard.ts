/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of auth guard code (AuthenticatedRequest, AuthGuard).
 * Author review: Checked AuthenticatedRequest, AuthGuard request checks, accepted credentials, and rejection branches; clarified condition layout and error wording.
 */

import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { SERVICE_CLIENTS } from '../application/ports';
import type { ErrandServices } from '../application/ports';
import { UpstreamFailure } from '../infrastructure/service-clients';
export interface AuthenticatedRequest extends FastifyRequest {
  userId: string;
  accessToken: string;
}
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(SERVICE_CLIENTS) private readonly clients: ErrandServices,
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const match = request.headers.authorization?.match(/^Bearer\s+(\S+)$/i);
    if (!match)
      throw new UnauthorizedException(
        'A valid User Service session is required.',
      );
    try {
      request.userId = await this.clients.identity(match[1]);
      request.accessToken = match[1];
    } catch (error) {
      if (error instanceof UpstreamFailure && [401, 403].includes(error.status))
        throw new UnauthorizedException(
          'The account session is inactive or expired.',
        );
      throw error;
    }
    return true;
  }
}
