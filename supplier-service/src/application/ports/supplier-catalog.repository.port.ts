// AI-assisted portions: supplier categories (OpenAI Codex, GPT-6.1). Human review confirmed by the team, 2026-11-10. See /ai/usage-log.md.
import type {
  CampusLocationCatalogEntry,
  SupplierCatalogEntry,
} from '../../domain/supplier-catalog.js';
import type { SupplierTag } from '../../domain/supplier-categories.js';

export interface SupplierCatalogRepositoryPort {
  findActiveSuppliers(category?: SupplierTag): Promise<SupplierCatalogEntry[]>;
  findCampusLocations(): Promise<CampusLocationCatalogEntry[]>;
}
