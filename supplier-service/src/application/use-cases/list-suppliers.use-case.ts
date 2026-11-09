import type { SupplierCatalogEntry } from '../../domain/supplier-catalog.js';
import type { SupplierCatalogRepositoryPort } from '../ports/supplier-catalog.repository.port.js';
import {
  normaliseCategories,
  type SupplierTag,
} from '../../domain/supplier-categories.js';

export class ListSuppliersUseCase {
  constructor(private readonly repository: SupplierCatalogRepositoryPort) {}

  execute(category?: SupplierTag): Promise<SupplierCatalogEntry[]> {
    if (category !== undefined) normaliseCategories([category]);
    return this.repository.findActiveSuppliers(category);
  }
}
