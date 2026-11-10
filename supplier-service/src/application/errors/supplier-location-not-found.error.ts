/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of supplier location not found error code (SupplierLocationNotFoundError).
 * Author review: Checked SupplierLocationNotFoundError error messages and codes SUPPLIER_LOCATION_NOT_FOUND; standardized exception naming and formatting.
 */

export class SupplierLocationNotFoundError extends Error {
  readonly code = 'SUPPLIER_LOCATION_NOT_FOUND';
  readonly field = 'locationId';

  constructor(
    public readonly supplierId: string,
    public readonly locationId: string,
  ) {
    super('Supplier location was not found for this supplier.');
    this.name = 'SupplierLocationNotFoundError';
  }
}
