/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of require roles decorator code (REQUIRED_ROLES_METADATA, RequireRoles).
 * Author review: Validated REQUIRED_ROLES_METADATA, RequireRoles existing type members and constant values in supplier-service/require-roles.decorator.ts; edited naming and formatting for readability.
 */

import { SetMetadata } from '@nestjs/common';

import type { UserRole } from './user-role.js';

export const REQUIRED_ROLES_METADATA = 'required-roles';

export const RequireRoles = (
  ...roles: UserRole[]
): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_ROLES_METADATA, roles);
