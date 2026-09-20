import type { SupplierCatalogRepositoryPort } from '../../application/ports/supplier-catalog.repository.port.js';
import type { SupplierCatalogEntry } from '../../domain/supplier-catalog.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

const ACTIVE_CATALOG_QUERY = {
  include: {
    locations: {
      orderBy: { supplierAtLocation: 'asc' as const },
      where: { isActive: true },
    },
  },
  orderBy: { name: 'asc' as const },
  where: {
    isActive: true,
    locations: { some: { isActive: true } },
  },
};

export class PrismaSupplierCatalogRepository implements SupplierCatalogRepositoryPort {
  constructor(private readonly prisma: Pick<PrismaClient, 'supplier'>) {}

  async findActiveSuppliers(): Promise<SupplierCatalogEntry[]> {
    const suppliers = await this.prisma.supplier.findMany(ACTIVE_CATALOG_QUERY);

    return suppliers.map((supplier) => ({
      category: supplier.category,
      id: supplier.id,
      locations: supplier.locations.map((location) => ({
        building: location.building,
        closesAt: this.formatTime(location.closesAt),
        floor: location.floor,
        id: location.id,
        imageUrl: location.imageUrl,
        isOpenOvernight: location.isOpenOvernight,
        latitude: location.latitude.toNumber(),
        locationDescription: location.locationDescription,
        longitude: location.longitude.toNumber(),
        opensAt: this.formatTime(location.opensAt),
        supplierAtLocation: location.supplierAtLocation,
      })),
      name: supplier.name,
    }));
  }

  private formatTime(value: Date): string {
    return value.toISOString().slice(11, 16);
  }
}
