/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of uuid generator code (UuidGenerator).
 * Author review: Validated UuidGenerator value handling and returned results in user-service/uuid-generator.ts; edited naming and formatting for readability.
 */

import { randomUUID } from 'node:crypto';

import type { IdGeneratorPort } from '../../application/ports/id-generator.port.js';

export class UuidGenerator implements IdGeneratorPort {
  generate(): string {
    return randomUUID();
  }
}
