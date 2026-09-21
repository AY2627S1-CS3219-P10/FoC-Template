export class SupplierNotFoundError extends Error {
  readonly code = 'SUPPLIER_NOT_FOUND';
  readonly field = 'supplierId';

  constructor(public readonly supplierId: string) {
    super('Supplier was not found.');
    this.name = 'SupplierNotFoundError';
  }
}
