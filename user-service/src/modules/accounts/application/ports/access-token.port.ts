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
