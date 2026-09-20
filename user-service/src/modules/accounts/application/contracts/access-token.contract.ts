export const ACCESS_TOKEN_ALGORITHM = 'HS256' as const;
export const ACCESS_TOKEN_TYPE = 'JWT' as const;
export const ACCESS_TOKEN_ISSUER = 'foc-user-service';
export const ACCESS_TOKEN_AUDIENCE = 'foc-api';
export const ACCESS_TOKEN_LIFETIME_SECONDS = 15 * 60;

export const ACCESS_TOKEN_CLAIM_NAMES = Object.freeze({
  isAdmin: 'isAdmin',
  sessionId: 'sid',
  userId: 'sub',
} as const);
