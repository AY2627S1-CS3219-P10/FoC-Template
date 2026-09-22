import type { SupplierLocationCatalogEntry } from '../../domain/supplier-catalog.js';
import {
  assertCoordinate,
  assertFloor,
  normalizeOptionalImageUrl,
  normalizeRequiredText,
  parseCatalogTime,
} from '../../domain/supplier-input.js';
import { SupplierValidationError } from '../../domain/supplier-validation.error.js';
import type { SupplierManagementRepositoryPort } from '../ports/supplier-management.repository.port.js';

export interface UpdateSupplierLocationInput {
  building?: string;
  closesAt?: string;
  floor?: number;
  imageUrl?: string | null;
  latitude?: number;
  locationDescription?: string;
  longitude?: number;
  opensAt?: string;
}

export class UpdateSupplierLocationUseCase {
  constructor(private readonly repository: SupplierManagementRepositoryPort) {}

  async execute(
    supplierId: string,
    locationId: string,
    input: UpdateSupplierLocationInput,
  ): Promise<SupplierLocationCatalogEntry> {
    this.assertNotEmpty(input);

    const building =
      input.building === undefined
        ? undefined
        : normalizeRequiredText(input.building, 'building', 160);
    const locationDescription =
      input.locationDescription === undefined
        ? undefined
        : normalizeRequiredText(
            input.locationDescription,
            'locationDescription',
            500,
          );

    if (input.floor !== undefined) {
      assertFloor(input.floor);
    }

    if (input.latitude !== undefined) {
      assertCoordinate(input.latitude, 'latitude');
    }

    if (input.longitude !== undefined) {
      assertCoordinate(input.longitude, 'longitude');
    }

    const opensAt =
      input.opensAt === undefined
        ? undefined
        : parseCatalogTime(input.opensAt, 'opensAt');
    const closesAt =
      input.closesAt === undefined
        ? undefined
        : parseCatalogTime(input.closesAt, 'closesAt');
    const imageUrl =
      input.imageUrl === undefined
        ? undefined
        : normalizeOptionalImageUrl(input.imageUrl ?? undefined);

    return this.repository.updateSupplierLocation({
      building,
      closesAt,
      floor: input.floor,
      imageUrl,
      latitude: input.latitude,
      locationDescription,
      locationId,
      longitude: input.longitude,
      opensAt,
      supplierId,
    });
  }

  private assertNotEmpty(input: UpdateSupplierLocationInput): void {
    if (
      input.building === undefined &&
      input.closesAt === undefined &&
      input.floor === undefined &&
      input.imageUrl === undefined &&
      input.latitude === undefined &&
      input.locationDescription === undefined &&
      input.longitude === undefined &&
      input.opensAt === undefined
    ) {
      throw new SupplierValidationError(
        'location',
        'SUPPLIER_LOCATION_UPDATE_EMPTY',
        'At least one supplier location field must be provided.',
      );
    }
  }
}
