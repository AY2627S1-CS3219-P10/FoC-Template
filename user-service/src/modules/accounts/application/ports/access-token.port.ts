export interface AccessTokenClaims {
  isAdmin: boolean;
  sessionId: string;
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
