/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of supplier catalog code (CampusLocationCatalogEntry, SupplierLocationCatalogEntry, SupplierCatalogEntry).
 * Author review: Validated CampusLocationCatalogEntry, SupplierLocationCatalogEntry existing type members and constant values in supplier-service/supplier-catalog.ts; edited naming and formatting for readability.
 */

import type { SupplierCategory } from './supplier-input.js';

export type { SupplierCategory } from './supplier-input.js';

export interface CampusLocationCatalogEntry {
  building: string;
  id: string;
  latitude: number;
  longitude: number;
}

export interface SupplierLocationCatalogEntry {
  building: string;
  closesAt: string;
  floor: number | null;
  id: string;
  imageUrl: string | null;
  isOpenOvernight: boolean;
  latitude: number | null;
  locationDescription: string;
  longitude: number | null;
  opensAt: string;
  supplierAtLocation: string;
}

export interface SupplierCatalogEntry {
  category: SupplierCategory;
  id: string;
  locations: SupplierLocationCatalogEntry[];
  name: string;
}
