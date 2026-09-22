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
