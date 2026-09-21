import type { SupplierCatalogRepositoryPort } from '../../application/ports/supplier-catalog.repository.port.js';
import { SupplierAlreadyExistsError } from '../../application/errors/supplier-already-exists.error.js';
import { SupplierNotFoundError } from '../../application/errors/supplier-not-found.error.js';
import type {
  CreateSupplierRecord,
  SupplierManagementRepositoryPort,
  UpdateSupplierRecord,
} from '../../application/ports/supplier-management.repository.port.js';
import type { SupplierCatalogEntry } from '../../domain/supplier-catalog.js';
import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';

type SupplierWithLocations = Prisma.SupplierGetPayload<{
  include: { locations: true };
}>;

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
  constructor(private readonly prisma: Pick<PrismaClient, 'supplier'>) {}

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

  private mapSupplier(supplier: SupplierWithLocations): SupplierCatalogEntry {
    return {
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
    };
  }

  private formatTime(value: Date): string {
    return value.toISOString().slice(11, 16);
  }
}
