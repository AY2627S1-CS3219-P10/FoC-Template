import type { SupplierCatalogEntry } from '../../domain/supplier-catalog.js';

export interface SupplierCatalogRepositoryPort {
  findActiveSuppliers(): Promise<SupplierCatalogEntry[]>;
}
