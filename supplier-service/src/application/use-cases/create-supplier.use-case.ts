import type { SupplierCatalogEntry } from '../../domain/supplier-catalog.js';
import {
  assertFloor,
  assertSupplierCategory,
  assertUuid,
  normalizeOptionalImageUrl,
  normalizeRequiredText,
  parseCatalogTime,
} from '../../domain/supplier-input.js';
import { CampusLocationNotFoundError } from '../errors/campus-location-not-found.error.js';
import type { SupplierManagementRepositoryPort } from '../ports/supplier-management.repository.port.js';

export interface CreateSupplierInput {
  category: string;
  location: {
    campusLocationId: string;
    closesAt: string;
    floor: number;
    imageUrl?: string;
    locationDescription: string;
    opensAt: string;
  };
  name: string;
}

export class CreateSupplierUseCase {
  constructor(private readonly repository: SupplierManagementRepositoryPort) {}

  async execute(input: CreateSupplierInput): Promise<SupplierCatalogEntry> {
    const name = normalizeRequiredText(input.name, 'name', 160);
    assertSupplierCategory(input.category);
    assertUuid(input.location.campusLocationId, 'campusLocationId');
    const campusLocation = await this.repository.findCampusLocationById(
      input.location.campusLocationId,
    );
    if (!campusLocation) {
      throw new CampusLocationNotFoundError(input.location.campusLocationId);
    }
    const locationDescription = normalizeRequiredText(
      input.location.locationDescription,
      'locationDescription',
      500,
    );
    assertFloor(input.location.floor);

    const opensAt = parseCatalogTime(input.location.opensAt, 'opensAt');
    const closesAt = parseCatalogTime(input.location.closesAt, 'closesAt');
    const imageUrl = normalizeOptionalImageUrl(input.location.imageUrl);

    return this.repository.createSupplier({
      category: input.category,
      location: {
        building: campusLocation.building,
        closesAt,
        floor: input.location.floor,
        imageUrl,
        isOpenOvernight: closesAt.getTime() < opensAt.getTime(),
        latitude: campusLocation.latitude,
        locationDescription,
        longitude: campusLocation.longitude,
        opensAt,
        supplierAtLocation: `${name}@${campusLocation.building}`,
      },
      name,
    });
  }
}
