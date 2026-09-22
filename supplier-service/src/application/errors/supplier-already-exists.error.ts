export type DuplicateSupplierField = 'name' | 'supplierAtLocation';

export class SupplierAlreadyExistsError extends Error {
  readonly code = 'SUPPLIER_ALREADY_EXISTS';

  constructor(public readonly field: DuplicateSupplierField) {
    super(
      field === 'name'
        ? 'A supplier with this name already exists.'
        : 'A supplier location with this display name already exists.',
    );
    this.name = 'SupplierAlreadyExistsError';
  }
}
