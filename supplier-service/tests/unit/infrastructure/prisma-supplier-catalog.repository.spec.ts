import { PrismaSupplierCatalogRepository } from '../../../src/infrastructure/persistence/prisma-supplier-catalog.repository.js';
import type { PrismaClient } from '../../../src/generated/prisma/client.js';

const SUPPLIER_ID = '30000000-0000-4000-8000-000000000001';
const UTOWN_LOCATION_ID = '40000000-0000-4000-8000-000000000001';
const SCIENCE_LOCATION_ID = '40000000-0000-4000-8000-000000000002';

describe('PrismaSupplierCatalogRepository', () => {
  it('deactivates a supplier and all active locations in one nested update', async () => {
    let updateArguments: unknown;
    const update = (args: unknown): Promise<unknown> => {
      updateArguments = args;
      return Promise.resolve({ id: SUPPLIER_ID });
    };

    const repository = new PrismaSupplierCatalogRepository({
      supplier: { update },
    } as unknown as Pick<PrismaClient, 'supplier' | 'supplierLocation'>);

    await expect(
      repository.deactivateSupplier(SUPPLIER_ID),
    ).resolves.toBeUndefined();
    expect(updateArguments).toEqual({
      data: {
        isActive: false,
        locations: {
          updateMany: {
            data: { isActive: false },
            where: { isActive: true },
          },
        },
      },
      where: { id: SUPPLIER_ID },
    });
  });

  it('renames the supplier and all supplier-location labels in one nested update', async () => {
    const findUnique = (args: unknown): Promise<unknown> => {
      void args;
      return Promise.resolve({
        locations: [
          { building: 'UTown', id: UTOWN_LOCATION_ID },
          { building: 'Science', id: SCIENCE_LOCATION_ID },
        ],
      });
    };
    let updateArguments: unknown;
    const update = (args: unknown): Promise<unknown> => {
      updateArguments = args;

      return Promise.resolve({
        category: 'FOOD_COFFEE',
        createdAt: new Date('2026-09-21T00:00:00.000Z'),
        id: SUPPLIER_ID,
        isActive: true,
        locations: [
          locationRecord(UTOWN_LOCATION_ID, 'UTown', 'Starbucks Coffee@UTown'),
          locationRecord(
            SCIENCE_LOCATION_ID,
            'Science',
            'Starbucks Coffee@Science',
          ),
        ],
        name: 'Starbucks Coffee',
        updatedAt: new Date('2026-09-21T00:00:00.000Z'),
      });
    };

    const repository = new PrismaSupplierCatalogRepository({
      supplier: { findUnique, update },
    } as unknown as Pick<PrismaClient, 'supplier' | 'supplierLocation'>);

    await expect(
      repository.updateSupplier({
        id: SUPPLIER_ID,
        name: 'Starbucks Coffee',
      }),
    ).resolves.toMatchObject({
      name: 'Starbucks Coffee',
      locations: [
        { supplierAtLocation: 'Starbucks Coffee@UTown' },
        { supplierAtLocation: 'Starbucks Coffee@Science' },
      ],
    });
    expect(updateArguments).toEqual({
      data: {
        category: undefined,
        locations: {
          update: [
            {
              data: { supplierAtLocation: 'Starbucks Coffee@UTown' },
              where: { id: UTOWN_LOCATION_ID },
            },
            {
              data: { supplierAtLocation: 'Starbucks Coffee@Science' },
              where: { id: SCIENCE_LOCATION_ID },
            },
          ],
        },
        name: 'Starbucks Coffee',
      },
      include: { locations: true },
      where: { id: SUPPLIER_ID },
    });
  });

  it('replaces old location details while retaining the location id', async () => {
    let findFirstArguments: unknown;
    let updateArguments: unknown;
    const findFirst = (args: unknown): Promise<unknown> => {
      findFirstArguments = args;
      return Promise.resolve({
        ...locationRecord(UTOWN_LOCATION_ID, 'UTown', 'Starbucks@UTown'),
        supplier: { name: 'Starbucks' },
      });
    };
    const update = (args: unknown): Promise<unknown> => {
      updateArguments = args;
      return Promise.resolve(
        locationRecord(UTOWN_LOCATION_ID, 'Science', 'Starbucks@Science'),
      );
    };

    const repository = new PrismaSupplierCatalogRepository({
      supplierLocation: { findFirst, update },
    } as unknown as Pick<PrismaClient, 'supplier' | 'supplierLocation'>);

    await expect(
      repository.updateSupplierLocation({
        building: 'Science',
        floor: 2,
        latitude: 1.2966,
        locationDescription: 'Beside the main entrance',
        locationId: UTOWN_LOCATION_ID,
        longitude: 103.7801,
        supplierId: SUPPLIER_ID,
      }),
    ).resolves.toMatchObject({
      building: 'Science',
      id: UTOWN_LOCATION_ID,
      supplierAtLocation: 'Starbucks@Science',
    });
    expect(findFirstArguments).toEqual({
      include: { supplier: { select: { name: true } } },
      where: {
        id: UTOWN_LOCATION_ID,
        supplierId: SUPPLIER_ID,
      },
    });
    expect(updateArguments).toEqual({
      data: {
        building: 'Science',
        closesAt: undefined,
        floor: 2,
        imageUrl: undefined,
        isOpenOvernight: false,
        latitude: 1.2966,
        locationDescription: 'Beside the main entrance',
        longitude: 103.7801,
        opensAt: undefined,
        supplierAtLocation: 'Starbucks@Science',
      },
      where: { id: UTOWN_LOCATION_ID },
    });
  });
});

function locationRecord(
  id: string,
  building: string,
  supplierAtLocation: string,
): object {
  return {
    building,
    closesAt: new Date('1970-01-01T20:00:00.000Z'),
    createdAt: new Date('2026-09-21T00:00:00.000Z'),
    floor: 1,
    id,
    imageUrl: null,
    isActive: true,
    isOpenOvernight: false,
    latitude: { toNumber: (): number => 1.3048 },
    locationDescription: 'Near the main entrance',
    longitude: { toNumber: (): number => 103.7739 },
    opensAt: new Date('1970-01-01T08:00:00.000Z'),
    supplierAtLocation,
    supplierId: SUPPLIER_ID,
    updatedAt: new Date('2026-09-21T00:00:00.000Z'),
  };
}
