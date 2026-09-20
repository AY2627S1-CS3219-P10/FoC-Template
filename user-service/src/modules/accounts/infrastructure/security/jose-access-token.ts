import { jwtVerify, SignJWT } from 'jose';

import type {
  AccessTokenClaims,
  AccessTokenPort,
  IssueAccessTokenInput,
} from '../../application/ports/access-token.port.js';

export const ACCESS_TOKEN_ISSUER = 'foc-user-service';
export const ACCESS_TOKEN_AUDIENCE = 'foc-api';

export class JoseAccessToken implements AccessTokenPort {
  private readonly key: Uint8Array;

  constructor(secret: string) {
    this.key = new TextEncoder().encode(secret);
  }

  issue(input: IssueAccessTokenInput): Promise<string> {
    return new SignJWT({
      isAdmin: input.isAdmin,
      sid: input.sessionId,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(input.userId)
      .setIssuer(ACCESS_TOKEN_ISSUER)
      .setAudience(ACCESS_TOKEN_AUDIENCE)
      .setIssuedAt(Math.floor(input.issuedAt.getTime() / 1000))
      .setExpirationTime(Math.floor(input.expiresAt.getTime() / 1000))
      .sign(this.key);
  }

  async verify(token: string): Promise<AccessTokenClaims> {
    const { payload } = await jwtVerify(token, this.key, {
      algorithms: ['HS256'],
      audience: ACCESS_TOKEN_AUDIENCE,
      issuer: ACCESS_TOKEN_ISSUER,
    });

    if (
      typeof payload.sub !== 'string' ||
      typeof payload.sid !== 'string' ||
      typeof payload.isAdmin !== 'boolean'
    ) {
      throw new Error('Access token contains invalid claims.');
    }

    return {
      isAdmin: payload.isAdmin,
      sessionId: payload.sid,
      userId: payload.sub,
    };
  }
}
