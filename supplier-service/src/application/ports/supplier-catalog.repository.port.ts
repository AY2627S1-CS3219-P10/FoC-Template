/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of supplier catalog repository port code (SupplierCatalogRepositoryPort).
 * Author review: Checked existing SupplierCatalogRepositoryPort parameter and return types against their callers; edited type declaration layout and member naming.
 */

import type {
  CampusLocationCatalogEntry,
  SupplierCatalogEntry,
} from '../../domain/supplier-catalog.js';
import type { SupplierTag } from '../../domain/supplier-categories.js';

export interface SupplierCatalogRepositoryPort {
  findActiveSuppliers(category?: SupplierTag): Promise<SupplierCatalogEntry[]>;
  findCampusLocations(): Promise<CampusLocationCatalogEntry[]>;
}
