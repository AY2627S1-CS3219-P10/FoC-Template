import type {
  CampusLocationCatalogEntry,
  SupplierCatalogEntry,
} from '../../domain/supplier-catalog.js';
import type { SupplierTag } from '../../domain/supplier-categories.js';

export interface SupplierCatalogRepositoryPort {
  findActiveSuppliers(category?: SupplierTag): Promise<SupplierCatalogEntry[]>;
  findCampusLocations(): Promise<CampusLocationCatalogEntry[]>;
}
