import type {
  SupplierCatalogEntry,
  SupplierLocationCatalogEntry,
} from '../../domain/supplier-catalog.js';
import type { SupplierCategory } from '../../domain/supplier-input.js';

export interface CreateSupplierRecord {
  category: SupplierCategory;
  location: {
    building: string;
    closesAt: Date;
    floor: number;
    imageUrl: string | null;
    isOpenOvernight: boolean;
    latitude: number;
    locationDescription: string;
    longitude: number;
    opensAt: Date;
    supplierAtLocation: string;
  };
  name: string;
}

export interface UpdateSupplierRecord {
  category?: SupplierCategory;
  id: string;
  name?: string;
}

export interface UpdateSupplierLocationRecord {
  building?: string;
  closesAt?: Date;
  floor?: number;
  imageUrl?: string | null;
  latitude?: number;
  locationDescription?: string;
  locationId: string;
  longitude?: number;
  opensAt?: Date;
  supplierId: string;
}

export interface SupplierManagementRepositoryPort {
  createSupplier(record: CreateSupplierRecord): Promise<SupplierCatalogEntry>;
  deactivateSupplier(supplierId: string): Promise<void>;
  updateSupplier(record: UpdateSupplierRecord): Promise<SupplierCatalogEntry>;
  updateSupplierLocation(
    record: UpdateSupplierLocationRecord,
  ): Promise<SupplierLocationCatalogEntry>;
}
