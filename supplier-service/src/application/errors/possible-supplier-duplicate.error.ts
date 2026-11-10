/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of possible supplier duplicate error code (PossibleSupplierDuplicateError).
 * Author review: Checked PossibleSupplierDuplicateError error messages and codes POSSIBLE_SUPPLIER_DUPLICATE; standardized exception naming and formatting.
 */

import type {
  PossibleSupplierDuplicate,
} from '../ports/supplier-management.repository.port.js';

export class PossibleSupplierDuplicateError extends Error {
  readonly code = 'POSSIBLE_SUPPLIER_DUPLICATE';

  constructor(
    public readonly matches: PossibleSupplierDuplicate[],
  ) {
    super('Similar suppliers already exist at this location.');
    this.name = 'PossibleSupplierDuplicateError';
  }
}
