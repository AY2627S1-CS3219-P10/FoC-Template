/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of hmac verification code hasher code (HmacVerificationCodeHasher).
 * Author review: Validated HmacVerificationCodeHasher input handling, return values, and thrown errors in user-service/hmac-verification-code-hasher.ts; edited naming and formatting for readability.
 */

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
