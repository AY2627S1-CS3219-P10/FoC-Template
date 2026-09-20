export type SupplierValidationField =
  | 'building'
  | 'category'
  | 'closesAt'
  | 'floor'
  | 'imageUrl'
  | 'latitude'
  | 'locationDescription'
  | 'longitude'
  | 'name'
  | 'opensAt';

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
