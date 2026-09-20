import type { SupplierCategory } from './supplier-input.js';

export type { SupplierCategory } from './supplier-input.js';

export interface SupplierLocationCatalogEntry {
  building: string;
  closesAt: string;
  floor: number;
  id: string;
  imageUrl: string | null;
  isOpenOvernight: boolean;
  latitude: number;
  locationDescription: string;
  longitude: number;
  opensAt: string;
  supplierAtLocation: string;
}

export interface SupplierCatalogEntry {
  category: SupplierCategory;
  id: string;
  locations: SupplierLocationCatalogEntry[];
  name: string;
}
