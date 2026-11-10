/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of six digit code generator code (SixDigitCodeGenerator).
 * Author review: Validated SixDigitCodeGenerator value handling and returned results in user-service/six-digit-code-generator.ts; edited naming and formatting for readability.
 */

import { randomInt } from 'node:crypto';

import type { VerificationCodeGeneratorPort } from '../../application/ports/verification-code-generator.port.js';

export class SixDigitCodeGenerator implements VerificationCodeGeneratorPort {
  generate(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }
}
