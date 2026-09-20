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
