/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of roles guard code (RolesGuard).
 * Author review: Checked RolesGuard request checks, accepted credentials, and rejection branches; clarified condition layout and error wording.
 */

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { AuthenticatedRequest } from './authenticated-request.js';
import { REQUIRED_ROLES_METADATA } from './require-roles.decorator.js';
import type { UserRole } from './user-role.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      REQUIRED_ROLES_METADATA,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.user) {
      throw new UnauthorizedException('Authentication must run before RBAC.');
    }

    if (!requiredRoles.includes(request.user.role)) {
      throw new ForbiddenException(
        'Your role does not allow this supplier operation.',
      );
    }

    return true;
  }
}
