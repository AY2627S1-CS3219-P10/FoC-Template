import type {
  CampusLocationCatalogEntry,
  SupplierLocationCatalogEntry,
} from '../../domain/supplier-catalog.js';
import {
  assertFloor,
  assertUuid,
  normalizeOptionalImageUrl,
  normalizeRequiredText,
  parseCatalogTime,
} from '../../domain/supplier-input.js';
import { SupplierValidationError } from '../../domain/supplier-validation.error.js';
import { CampusLocationNotFoundError } from '../errors/campus-location-not-found.error.js';
import type { SupplierManagementRepositoryPort } from '../ports/supplier-management.repository.port.js';

export interface UpdateSupplierLocationInput {
  campusLocationId?: string;
  closesAt?: string;
  floor?: number;
  imageUrl?: string | null;
  locationDescription?: string;
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

    let campusLocation: CampusLocationCatalogEntry | null | undefined;
    if (input.campusLocationId !== undefined) {
      assertUuid(input.campusLocationId, 'campusLocationId');
      campusLocation = await this.repository.findCampusLocationById(
        input.campusLocationId,
      );
      if (!campusLocation) {
        throw new CampusLocationNotFoundError(input.campusLocationId);
      }
    }
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
      building: campusLocation?.building,
      closesAt,
      floor: input.floor,
      imageUrl,
      latitude: campusLocation?.latitude,
      locationDescription,
      locationId,
      longitude: campusLocation?.longitude,
      opensAt,
      supplierId,
    });
  }

  private assertNotEmpty(input: UpdateSupplierLocationInput): void {
    if (
      input.campusLocationId === undefined &&
      input.closesAt === undefined &&
      input.floor === undefined &&
      input.imageUrl === undefined &&
      input.locationDescription === undefined &&
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
