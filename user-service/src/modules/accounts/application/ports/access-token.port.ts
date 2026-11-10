/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of access token port code (AccessTokenClaims, IssueAccessTokenInput, AccessTokenPort).
 * Author review: Checked existing AccessTokenClaims, IssueAccessTokenInput parameter and return types against their callers; edited type declaration layout and member naming.
 */

export interface AccessTokenClaims {
  /** Stable JWT `isAdmin` claim. */
  isAdmin: boolean;
  /** Stable JWT `sid` claim. */
  sessionId: string;
  /** Stable JWT `sub` claim. */
  userId: string;
}

export interface IssueAccessTokenInput extends AccessTokenClaims {
  expiresAt: Date;
  issuedAt: Date;
}

export interface AccessTokenPort {
  issue(input: IssueAccessTokenInput): Promise<string>;
  verify(token: string): Promise<AccessTokenClaims>;
}
