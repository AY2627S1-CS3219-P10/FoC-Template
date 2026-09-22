import type { SupplierCatalogRepositoryPort } from '../../application/ports/supplier-catalog.repository.port.js';
import { SupplierAlreadyExistsError } from '../../application/errors/supplier-already-exists.error.js';
import { SupplierLocationNotFoundError } from '../../application/errors/supplier-location-not-found.error.js';
import { SupplierNotFoundError } from '../../application/errors/supplier-not-found.error.js';
import type {
  CreateSupplierRecord,
  SupplierManagementRepositoryPort,
  UpdateSupplierLocationRecord,
  UpdateSupplierRecord,
} from '../../application/ports/supplier-management.repository.port.js';
import type {
  SupplierCatalogEntry,
  SupplierLocationCatalogEntry,
} from '../../domain/supplier-catalog.js';
import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';

type SupplierWithLocations = Prisma.SupplierGetPayload<{
  include: { locations: true };
}>;
type SupplierLocationRecord = SupplierWithLocations['locations'][number];

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

export class PrismaSupplierCatalogRepository
  implements SupplierCatalogRepositoryPort, SupplierManagementRepositoryPort
{
  constructor(
    private readonly prisma: Pick<
      PrismaClient,
      'supplier' | 'supplierLocation'
    >,
  ) {}

  async findActiveSuppliers(): Promise<SupplierCatalogEntry[]> {
    const suppliers = await this.prisma.supplier.findMany(ACTIVE_CATALOG_QUERY);

    return suppliers.map((supplier) => this.mapSupplier(supplier));
  }

  async createSupplier(
    record: CreateSupplierRecord,
  ): Promise<SupplierCatalogEntry> {
    try {
      const supplier = await this.prisma.supplier.create({
        data: {
          category: record.category,
          locations: {
            create: record.location,
          },
          name: record.name,
        },
        include: { locations: true },
      });

      return this.mapSupplier(supplier);
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = JSON.stringify(error.meta?.target ?? '').toLowerCase();

        throw new SupplierAlreadyExistsError(
          target.includes('supplier_at_location')
            ? 'supplierAtLocation'
            : 'name',
        );
      }

      throw error;
    }
  }

  async deactivateSupplier(supplierId: string): Promise<void> {
    try {
      await this.prisma.supplier.update({
        data: {
          isActive: false,
          locations: {
            updateMany: {
              data: { isActive: false },
              where: { isActive: true },
            },
          },
        },
        where: { id: supplierId },
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new SupplierNotFoundError(supplierId);
      }

      throw error;
    }
  }

  async updateSupplier(
    record: UpdateSupplierRecord,
  ): Promise<SupplierCatalogEntry> {
    const existingSupplier = await this.prisma.supplier.findUnique({
      select: {
        locations: {
          select: { building: true, id: true },
        },
      },
      where: { id: record.id },
    });

    if (!existingSupplier) {
      throw new SupplierNotFoundError(record.id);
    }

    try {
      const supplier = await this.prisma.supplier.update({
        data: {
          category: record.category,
          locations:
            record.name === undefined
              ? undefined
              : {
                  update: existingSupplier.locations.map((location) => ({
                    data: {
                      supplierAtLocation: `${record.name}@${location.building}`,
                    },
                    where: { id: location.id },
                  })),
                },
          name: record.name,
        },
        include: { locations: true },
        where: { id: record.id },
      });

      return this.mapSupplier(supplier);
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = JSON.stringify(error.meta?.target ?? '').toLowerCase();

        throw new SupplierAlreadyExistsError(
          target.includes('supplier_at_location')
            ? 'supplierAtLocation'
            : 'name',
        );
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new SupplierNotFoundError(record.id);
      }

      throw error;
    }
  }

  async updateSupplierLocation(
    record: UpdateSupplierLocationRecord,
  ): Promise<SupplierLocationCatalogEntry> {
    const existingLocation = await this.prisma.supplierLocation.findFirst({
      include: { supplier: { select: { name: true } } },
      where: {
        id: record.locationId,
        supplierId: record.supplierId,
      },
    });

    if (!existingLocation) {
      throw new SupplierLocationNotFoundError(
        record.supplierId,
        record.locationId,
      );
    }

    const building = record.building ?? existingLocation.building;
    const opensAt = record.opensAt ?? existingLocation.opensAt;
    const closesAt = record.closesAt ?? existingLocation.closesAt;

    try {
      const location = await this.prisma.supplierLocation.update({
        data: {
          building: record.building,
          closesAt: record.closesAt,
          floor: record.floor,
          imageUrl: record.imageUrl,
          isOpenOvernight: closesAt.getTime() < opensAt.getTime(),
          latitude: record.latitude,
          locationDescription: record.locationDescription,
          longitude: record.longitude,
          opensAt: record.opensAt,
          supplierAtLocation: `${existingLocation.supplier.name}@${building}`,
        },
        where: { id: record.locationId },
      });

      return this.mapLocation(location);
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new SupplierAlreadyExistsError('supplierAtLocation');
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new SupplierLocationNotFoundError(
          record.supplierId,
          record.locationId,
        );
      }

      throw error;
    }
  }

  private mapSupplier(supplier: SupplierWithLocations): SupplierCatalogEntry {
    return {
      category: supplier.category,
      id: supplier.id,
      locations: supplier.locations.map((location) =>
        this.mapLocation(location),
      ),
      name: supplier.name,
    };
  }

  private mapLocation(
    location: SupplierLocationRecord,
  ): SupplierLocationCatalogEntry {
    return {
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
    };
  }

  private formatTime(value: Date): string {
    return value.toISOString().slice(11, 16);
  }
}
