import type { FastifyRequest } from 'fastify';

export interface AuthenticatedPrincipal {
  userId: string;
  sessionId: string;
  isAdmin: boolean;
}

export interface AuthenticatedRequest extends FastifyRequest {
  user?: AuthenticatedPrincipal;
}
