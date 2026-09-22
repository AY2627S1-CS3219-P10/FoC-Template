import type { SupplierCatalogEntry } from '../../domain/supplier-catalog.js';
import {
  assertCoordinate,
  assertFloor,
  assertSupplierCategory,
  normalizeOptionalImageUrl,
  normalizeRequiredText,
  parseCatalogTime,
} from '../../domain/supplier-input.js';
import type { SupplierManagementRepositoryPort } from '../ports/supplier-management.repository.port.js';

export interface CreateSupplierInput {
  category: string;
  location: {
    building: string;
    closesAt: string;
    floor: number;
    imageUrl?: string;
    latitude: number;
    locationDescription: string;
    longitude: number;
    opensAt: string;
  };
  name: string;
}

export class CreateSupplierUseCase {
  constructor(private readonly repository: SupplierManagementRepositoryPort) {}

  async execute(input: CreateSupplierInput): Promise<SupplierCatalogEntry> {
    const name = normalizeRequiredText(input.name, 'name', 160);
    assertSupplierCategory(input.category);

    const building = normalizeRequiredText(
      input.location.building,
      'building',
      160,
    );
    const locationDescription = normalizeRequiredText(
      input.location.locationDescription,
      'locationDescription',
      500,
    );
    assertFloor(input.location.floor);
    assertCoordinate(input.location.latitude, 'latitude');
    assertCoordinate(input.location.longitude, 'longitude');

    const opensAt = parseCatalogTime(input.location.opensAt, 'opensAt');
    const closesAt = parseCatalogTime(input.location.closesAt, 'closesAt');
    const imageUrl = normalizeOptionalImageUrl(input.location.imageUrl);

    return this.repository.createSupplier({
      category: input.category,
      location: {
        building,
        closesAt,
        floor: input.location.floor,
        imageUrl,
        isOpenOvernight: closesAt.getTime() < opensAt.getTime(),
        latitude: input.location.latitude,
        locationDescription,
        longitude: input.location.longitude,
        opensAt,
        supplierAtLocation: `${name}@${building}`,
      },
      name,
    });
  }
}
