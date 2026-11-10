// AI-assisted portions: supplier categories (OpenAI Codex, GPT-6.1). Human review confirmed by the team, 2026-11-10. See /ai/usage-log.md.
import type { PossibleSupplierDuplicate } from '../ports/supplier-management.repository.port.js';

export class PossibleSupplierDuplicateError extends Error {
  readonly code = 'POSSIBLE_SUPPLIER_DUPLICATE';

  constructor(public readonly matches: PossibleSupplierDuplicate[]) {
    super('Similar suppliers already exist at this location.');
    this.name = 'PossibleSupplierDuplicateError';
  }
}
