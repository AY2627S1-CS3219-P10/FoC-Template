import type {
  CampusLocationCatalogEntry,
  SupplierCatalogEntry,
  SupplierLocationCatalogEntry,
} from '../../domain/supplier-catalog.js';
import type { SupplierCategory } from '../../domain/supplier-input.js';

export interface CreateSupplierRecord {
  confirmDistinctOutlet?: boolean;
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
  confirmDistinctOutlet?: boolean;
  category?: SupplierCategory;
  id: string;
  name?: string;
}

export interface UpdateSupplierLocationRecord {
  confirmDistinctOutlet?: boolean;
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
  findCampusLocationById(
    campusLocationId: string,
  ): Promise<CampusLocationCatalogEntry | null>;
  updateSupplier(record: UpdateSupplierRecord): Promise<SupplierCatalogEntry>;
  updateSupplierLocation(
    record: UpdateSupplierLocationRecord,
  ): Promise<SupplierLocationCatalogEntry>;
  findPossibleDuplicates(
    input: FindSupplierDuplicatesInput,
  ): Promise<PossibleSupplierDuplicate[]>;
}

export interface PossibleSupplierDuplicate {
  locationDescription: string;
  supplierId: string;
  supplierName: string;
  locationId: string;
  building: string;
  floor: number | null;
}

export interface FindSupplierDuplicatesInput {
  building: string;
  floor: number;
  category: SupplierCategory;
  excludeLocationId?: string;
}
