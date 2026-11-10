/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of authenticated request code (AuthenticatedPrincipal, AuthenticatedRequest).
 * Author review: Validated AuthenticatedPrincipal, AuthenticatedRequest existing type members and constant values in credit-service/authenticated-request.ts; edited naming and formatting for readability.
 */

import type { FastifyRequest } from 'fastify';

export interface AuthenticatedPrincipal {
  userId: string;
  sessionId: string;
  isAdmin: boolean;
}

export interface AuthenticatedRequest extends FastifyRequest {
  user?: AuthenticatedPrincipal;
}
