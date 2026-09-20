import { SetMetadata } from '@nestjs/common';

import type { UserRole } from './user-role.js';

export const REQUIRED_ROLES_METADATA = 'required-roles';

export const RequireRoles = (
  ...roles: UserRole[]
): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_ROLES_METADATA, roles);
