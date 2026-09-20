import { jwtVerify, SignJWT } from 'jose';

import {
  ACCESS_TOKEN_ALGORITHM,
  ACCESS_TOKEN_AUDIENCE,
  ACCESS_TOKEN_CLAIM_NAMES,
  ACCESS_TOKEN_ISSUER,
  ACCESS_TOKEN_TYPE,
} from '../../application/contracts/access-token.contract.js';
import type {
  AccessTokenClaims,
  AccessTokenPort,
  IssueAccessTokenInput,
} from '../../application/ports/access-token.port.js';

export {
  ACCESS_TOKEN_ALGORITHM,
  ACCESS_TOKEN_AUDIENCE,
  ACCESS_TOKEN_CLAIM_NAMES,
  ACCESS_TOKEN_ISSUER,
  ACCESS_TOKEN_TYPE,
} from '../../application/contracts/access-token.contract.js';

export class JoseAccessToken implements AccessTokenPort {
  private readonly key: Uint8Array;

  constructor(secret: string) {
    this.key = new TextEncoder().encode(secret);
  }

  issue(input: IssueAccessTokenInput): Promise<string> {
    return new SignJWT({
      [ACCESS_TOKEN_CLAIM_NAMES.isAdmin]: input.isAdmin,
      [ACCESS_TOKEN_CLAIM_NAMES.sessionId]: input.sessionId,
    })
      .setProtectedHeader({
        alg: ACCESS_TOKEN_ALGORITHM,
        typ: ACCESS_TOKEN_TYPE,
      })
      .setSubject(input.userId)
      .setIssuer(ACCESS_TOKEN_ISSUER)
      .setAudience(ACCESS_TOKEN_AUDIENCE)
      .setIssuedAt(Math.floor(input.issuedAt.getTime() / 1000))
      .setExpirationTime(Math.floor(input.expiresAt.getTime() / 1000))
      .sign(this.key);
  }

  async verify(token: string): Promise<AccessTokenClaims> {
    const { payload, protectedHeader } = await jwtVerify(token, this.key, {
      algorithms: [ACCESS_TOKEN_ALGORITHM],
      audience: ACCESS_TOKEN_AUDIENCE,
      issuer: ACCESS_TOKEN_ISSUER,
    });
    const userId = payload[ACCESS_TOKEN_CLAIM_NAMES.userId];
    const sessionId = payload[ACCESS_TOKEN_CLAIM_NAMES.sessionId];
    const isAdmin = payload[ACCESS_TOKEN_CLAIM_NAMES.isAdmin];

    if (
      protectedHeader.typ !== ACCESS_TOKEN_TYPE ||
      typeof userId !== 'string' ||
      userId.length === 0 ||
      typeof sessionId !== 'string' ||
      sessionId.length === 0 ||
      typeof isAdmin !== 'boolean'
    ) {
      throw new Error('Access token contains invalid claims.');
    }

    return {
      isAdmin,
      sessionId,
      userId,
    };
  }
}
