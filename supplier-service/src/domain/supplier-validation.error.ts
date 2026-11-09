export type SupplierValidationField =
  | 'campusLocationId'
  | 'category'
  | 'categories'
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
