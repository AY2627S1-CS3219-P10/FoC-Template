import { randomInt } from 'node:crypto';

import type { VerificationCodeGeneratorPort } from '../../application/ports/verification-code-generator.port.js';

export class SixDigitCodeGenerator implements VerificationCodeGeneratorPort {
  generate(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }
}
