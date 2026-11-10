/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of access token contract code (ACCESS_TOKEN_ALGORITHM, ACCESS_TOKEN_TYPE, ACCESS_TOKEN_ISSUER).
 * Author review: Checked existing ACCESS_TOKEN_ALGORITHM, ACCESS_TOKEN_TYPE parameter and return types against their callers; edited type declaration layout and member naming.
 */

export const ACCESS_TOKEN_ALGORITHM = 'HS256' as const;
export const ACCESS_TOKEN_TYPE = 'JWT' as const;
export const ACCESS_TOKEN_ISSUER = 'foc-user-service';
export const ACCESS_TOKEN_AUDIENCE = 'foc-api';
export const ACCESS_TOKEN_LIFETIME_SECONDS = 200 * 60;

export const ACCESS_TOKEN_CLAIM_NAMES = Object.freeze({
  isAdmin: 'isAdmin',
  sessionId: 'sid',
  userId: 'sub',
} as const);
