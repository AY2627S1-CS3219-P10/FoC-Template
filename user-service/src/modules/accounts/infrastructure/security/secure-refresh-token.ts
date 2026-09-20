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
