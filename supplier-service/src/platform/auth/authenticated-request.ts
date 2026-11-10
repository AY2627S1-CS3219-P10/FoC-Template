/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of authenticated request code (AuthenticatedRequest).
 * Author review: Validated AuthenticatedRequest existing type members and constant values in supplier-service/authenticated-request.ts; edited naming and formatting for readability.
 */

import type { AuthenticatedUser } from './user-role.js';

export interface AuthenticatedRequest {
  headers: {
    authorization?: string;
  };
  user?: AuthenticatedUser;
}
