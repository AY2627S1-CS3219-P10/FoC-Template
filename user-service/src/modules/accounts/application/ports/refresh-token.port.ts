/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of refresh token port code (RefreshTokenPort).
 * Author review: Checked existing RefreshTokenPort parameter and return types against their callers; edited type declaration layout and member naming.
 */

export interface RefreshTokenPort {
  generate(): string;
  hash(token: string): string;
}
