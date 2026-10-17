export type DuplicateSupplierField = 'name' | 'supplierAtLocation' | 'location';

export class SupplierAlreadyExistsError extends Error {
  readonly code = 'SUPPLIER_ALREADY_EXISTS';

  constructor(public readonly field: DuplicateSupplierField) {
    super(
      field === 'name'
        ? 'A supplier with this name already exists.'
        : field === 'location'
          ? 'This pickup point matches an existing location description. Use or edit that outlet, or provide a clearly different physical location.'
          : 'This supplier already has this pickup point. Use or edit the existing outlet instead.',
    );
    this.name = 'SupplierAlreadyExistsError';
  }
}
