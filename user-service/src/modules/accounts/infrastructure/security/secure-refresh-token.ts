/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of secure refresh token code (SecureRefreshToken).
 * Author review: Validated SecureRefreshToken value handling and returned results in user-service/secure-refresh-token.ts; edited naming and formatting for readability.
 */

import { createHash, randomBytes } from 'node:crypto';

import type { RefreshTokenPort } from '../../application/ports/refresh-token.port.js';

export class SecureRefreshToken implements RefreshTokenPort {
  generate(): string {
    return randomBytes(32).toString('base64url');
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
