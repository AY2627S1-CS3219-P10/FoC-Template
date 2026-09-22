import type { AuthenticatedUser } from './user-role.js';

export interface AuthenticatedRequest {
  headers: {
    authorization?: string;
  };
  user?: AuthenticatedUser;
}
