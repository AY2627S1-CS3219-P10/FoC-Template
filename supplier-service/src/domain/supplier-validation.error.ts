/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of supplier validation error code (SupplierValidationField, SupplierValidationError).
 * Author review: Checked SupplierValidationField, SupplierValidationError error messages and exposed properties; standardized exception naming and formatting.
 */

export type SupplierValidationField =
  | 'campusLocationId'
  | 'category'
  | 'closesAt'
  | 'floor'
  | 'imageUrl'
  | 'locationDescription'
  | 'location'
  | 'name'
  | 'opensAt'
  | 'supplier';

export class SupplierValidationError extends Error {
  constructor(
    public readonly field: SupplierValidationField,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SupplierValidationError';
  }
}
