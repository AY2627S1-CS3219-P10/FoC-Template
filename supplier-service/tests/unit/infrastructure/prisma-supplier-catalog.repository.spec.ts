import { PrismaSupplierCatalogRepository } from '../../../src/infrastructure/persistence/prisma-supplier-catalog.repository.js';
import type { PrismaClient } from '../../../src/generated/prisma/client.js';

const SUPPLIER_ID = '30000000-0000-4000-8000-000000000001';
const UTOWN_LOCATION_ID = '40000000-0000-4000-8000-000000000001';
const SCIENCE_LOCATION_ID = '40000000-0000-4000-8000-000000000002';

describe('PrismaSupplierCatalogRepository', () => {
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
    } as unknown as Pick<PrismaClient, 'supplier'>);

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
