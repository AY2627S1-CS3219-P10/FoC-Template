import { createHmac } from 'node:crypto';

import type { VerificationCodeHasherPort } from '../../application/ports/verification-code-hasher.port.js';

export class HmacVerificationCodeHasher implements VerificationCodeHasherPort {
  constructor(private readonly secret: string) {
    if (secret.length < 32) {
      throw new Error(
        'Email verification code secret must contain at least 32 characters.',
      );
    }
  }

  hash(code: string): string {
    return createHmac('sha256', this.secret).update(code).digest('hex');
  }
}
