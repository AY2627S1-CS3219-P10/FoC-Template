import type { SupplierCatalogRepositoryPort } from '../../application/ports/supplier-catalog.repository.port.js';
import { SupplierAlreadyExistsError } from '../../application/errors/supplier-already-exists.error.js';
import { SupplierLocationNotFoundError } from '../../application/errors/supplier-location-not-found.error.js';
import { SupplierNotFoundError } from '../../application/errors/supplier-not-found.error.js';
import type {
  CreateSupplierRecord,
  FindSupplierDuplicatesInput,
  PossibleSupplierDuplicate,
  SupplierManagementRepositoryPort,
  UpdateSupplierLocationRecord,
  UpdateSupplierRecord,
} from '../../application/ports/supplier-management.repository.port.js';
import type {
  CampusLocationCatalogEntry,
  SupplierCatalogEntry,
  SupplierLocationCatalogEntry,
} from '../../domain/supplier-catalog.js';
import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';
import { SupplierValidationError } from '../../domain/supplier-validation.error.js';

type SupplierWithLocations = Prisma.SupplierGetPayload<{
  include: { locations: true };
}>;
type SupplierLocationRecord = SupplierWithLocations['locations'][number];

function uniqueConstraintTarget(
  error: Prisma.PrismaClientKnownRequestError,
): string {
  const adapterError = error.meta?.driverAdapterError as
    { cause?: { constraint?: unknown } } | undefined;
  return JSON.stringify(
    error.meta?.target ?? adapterError?.cause?.constraint ?? '',
  ).toLowerCase();
}

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
      '$transaction' | 'supplier' | 'supplierLocation'
    >,
  ) {}

  async findActiveSuppliers(): Promise<SupplierCatalogEntry[]> {
    const suppliers = await this.prisma.supplier.findMany(ACTIVE_CATALOG_QUERY);

    return suppliers.map((supplier) => this.mapSupplier(supplier));
  }

  async findCampusLocations(): Promise<CampusLocationCatalogEntry[]> {
    const locations = await this.prisma.supplierLocation.findMany({
      distinct: ['building'],
      orderBy: [{ building: 'asc' }, { id: 'asc' }],
      select: {
        building: true,
        id: true,
        latitude: true,
        longitude: true,
      },
    });

    return locations.flatMap((location) =>
      location.latitude === null || location.longitude === null
        ? []
        : [
            {
              building: location.building,
              id: location.id,
              latitude: location.latitude.toNumber(),
              longitude: location.longitude.toNumber(),
            },
          ],
    );
  }

  async findCampusLocationById(
    campusLocationId: string,
  ): Promise<CampusLocationCatalogEntry | null> {
    const location = await this.prisma.supplierLocation.findUnique({
      select: {
        building: true,
        id: true,
        latitude: true,
        longitude: true,
      },
      where: { id: campusLocationId },
    });

    return location && location.latitude !== null && location.longitude !== null
      ? {
          building: location.building,
          id: location.id,
          latitude: location.latitude.toNumber(),
          longitude: location.longitude.toNumber(),
        }
      : null;
  }

  async createSupplier(
    record: CreateSupplierRecord,
  ): Promise<SupplierCatalogEntry> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const supplier = await this.prisma.$transaction(
          async (transaction) => {
            // The case-insensitive name identifies the brand; building and floor identify an outlet.
            const owner = await transaction.supplier.upsert({
              where: { name: record.name },
              create: { name: record.name, category: record.category },
              update: {},
            });
            if (owner.category !== record.category) {
              throw new SupplierValidationError(
                'category',
                'SUPPLIER_CATEGORY_MISMATCH',
                `This supplier already exists with category ${owner.category}. Use its existing category when adding an outlet.`,
              );
            }
            if (!owner.isActive) {
              throw new SupplierValidationError(
                'supplier',
                'SUPPLIER_INACTIVE',
                'Cannot add an outlet to an inactive supplier.',
              );
            }
            return transaction.supplier.update({
              where: { id: owner.id },
              data: {
                locations: {
                  create: {
                    ...record.location,
                    supplierAtLocation: `${owner.name}@${record.location.building}`,
                  },
                },
              },
              include: { locations: true },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        return this.mapSupplier(supplier);
      } catch (error: unknown) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2034' ||
            (error.code === 'P2002' &&
              uniqueConstraintTarget(error).includes('name'))) &&
          attempt < 2
        ) {
          continue;
        }
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          // Prisma's pg adapter may nest constraint fields under driverAdapterError.
          const target = uniqueConstraintTarget(error);
          throw new SupplierAlreadyExistsError(
            target.includes('name') ? 'name' : 'supplierAtLocation',
          );
        }

        throw error;
      }
    }
    throw new Error('Supplier creation retry limit reached.');
  }

  async findPossibleDuplicates(
    input: FindSupplierDuplicatesInput,
  ): Promise<PossibleSupplierDuplicate[]> {
    const locations = await this.prisma.supplierLocation.findMany({
      where: {
        building: { equals: input.building, mode: 'insensitive' },
        floor: input.floor,
        isActive: true,
        supplier: { category: input.category, isActive: true },
        ...(input.excludeLocationId
          ? { id: { not: input.excludeLocationId } }
          : {}),
      },
      select: {
        id: true,
        supplierId: true,
        building: true,
        floor: true,
        supplier: { select: { name: true } },
      },
    });
    return locations.map((location) => ({
      supplierId: location.supplierId,
      supplierName: location.supplier.name,
      locationId: location.id,
      building: location.building,
      floor: location.floor,
    }));
  }

  async deactivateSupplier(supplierId: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.supplierLocation.deleteMany({
          where: { supplierId },
        });
        await transaction.supplier.delete({
          where: { id: supplierId },
        });
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
        const target = uniqueConstraintTarget(error);

        throw new SupplierAlreadyExistsError(
          target.includes('name') ? 'name' : 'supplierAtLocation',
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
      latitude: location.latitude?.toNumber() ?? null,
      locationDescription: location.locationDescription,
      longitude: location.longitude?.toNumber() ?? null,
      opensAt: this.formatTime(location.opensAt),
      supplierAtLocation: location.supplierAtLocation,
    };
  }

  private formatTime(value: Date): string {
    return value.toISOString().slice(11, 16);
  }
}
