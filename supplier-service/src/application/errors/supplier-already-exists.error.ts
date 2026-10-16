export type DuplicateSupplierField = 'name' | 'supplierAtLocation' | 'location';

export class SupplierAlreadyExistsError extends Error {
  readonly code = 'SUPPLIER_ALREADY_EXISTS';

  constructor(public readonly field: DuplicateSupplierField) {
    super(
      field === 'name'
        ? 'A supplier with this name already exists.'
        : field === 'location'
          ? 'A supplier in this service category already exists in this building on this floor. Use or edit the existing outlet instead.'
          : 'This supplier already has an outlet in this building on this floor. Edit the existing outlet instead.',
    );
    this.name = 'SupplierAlreadyExistsError';
  }
}
