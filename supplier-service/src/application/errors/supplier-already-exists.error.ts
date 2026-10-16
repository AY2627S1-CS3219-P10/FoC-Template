export type DuplicateSupplierField = 'name' | 'supplierAtLocation';

export class SupplierAlreadyExistsError extends Error {
  readonly code = 'SUPPLIER_ALREADY_EXISTS';

  constructor(public readonly field: DuplicateSupplierField) {
    super(
      field === 'name'
        ? 'A supplier with this name already exists.'
        : 'This supplier already has an outlet in this building on this floor. Edit the existing outlet instead.',
    );
    this.name = 'SupplierAlreadyExistsError';
  }
}
