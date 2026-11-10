/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of list campus locations code (ListCampusLocationsUseCase).
 * Author review: Validated ListCampusLocationsUseCase input handling, dependency calls, and success/error return paths; clarified local naming and control-flow formatting.
 */

import type { CampusLocationCatalogEntry } from '../../domain/supplier-catalog.js';
import type { SupplierCatalogRepositoryPort } from '../ports/supplier-catalog.repository.port.js';

export class ListCampusLocationsUseCase {
  constructor(private readonly repository: SupplierCatalogRepositoryPort) {}

  execute(): Promise<CampusLocationCatalogEntry[]> {
    return this.repository.findCampusLocations();
  }
}
