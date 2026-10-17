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
