/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of administrator only decorator code (AdministratorOnly).
 * Author review: Validated AdministratorOnly value handling and returned results in user-service/administrator-only.decorator.ts; edited naming and formatting for readability.
 */

import { applyDecorators, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { AdministratorAuthorizationGuard } from './administrator-authorization.guard.js';
import { BearerAuthenticationGuard } from './bearer-authentication.guard.js';

export function AdministratorOnly(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'Access token is invalid.' }),
    ApiForbiddenResponse({
      description: 'Administrator privileges are required.',
    }),
    UseGuards(BearerAuthenticationGuard, AdministratorAuthorizationGuard),
  );
}
