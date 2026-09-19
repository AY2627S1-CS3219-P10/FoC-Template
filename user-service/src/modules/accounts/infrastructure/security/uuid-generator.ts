import { randomUUID } from 'node:crypto';

import type { IdGeneratorPort } from '../../application/ports/id-generator.port.js';

export class UuidGenerator implements IdGeneratorPort {
  generate(): string {
    return randomUUID();
  }
}
