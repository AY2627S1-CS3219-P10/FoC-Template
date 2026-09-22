import type { SupplierCatalogEntry } from '../../domain/supplier-catalog.js';
import type { SupplierCatalogRepositoryPort } from '../ports/supplier-catalog.repository.port.js';

export class ListSuppliersUseCase {
  constructor(private readonly repository: SupplierCatalogRepositoryPort) {}

  execute(): Promise<SupplierCatalogEntry[]> {
    return this.repository.findActiveSuppliers();
  }
}
