import type {
  CampusLocationCatalogEntry,
  SupplierCatalogEntry,
} from '../../domain/supplier-catalog.js';

export interface SupplierCatalogRepositoryPort {
  findActiveSuppliers(): Promise<SupplierCatalogEntry[]>;
  findCampusLocations(): Promise<CampusLocationCatalogEntry[]>;
}
