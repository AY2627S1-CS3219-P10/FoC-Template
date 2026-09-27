import type { CampusLocationCatalogEntry } from '../../domain/supplier-catalog.js';
import type { SupplierCatalogRepositoryPort } from '../ports/supplier-catalog.repository.port.js';

export class ListCampusLocationsUseCase {
  constructor(private readonly repository: SupplierCatalogRepositoryPort) {}

  execute(): Promise<CampusLocationCatalogEntry[]> {
    return this.repository.findCampusLocations();
  }
}
