/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of supplier not found error code (SupplierNotFoundError).
 * Author review: Checked SupplierNotFoundError error messages and codes SUPPLIER_NOT_FOUND; standardized exception naming and formatting.
 */

export class SupplierNotFoundError extends Error {
  readonly code = 'SUPPLIER_NOT_FOUND';
  readonly field = 'supplierId';

  constructor(public readonly supplierId: string) {
    super('Supplier was not found.');
    this.name = 'SupplierNotFoundError';
  }
}
