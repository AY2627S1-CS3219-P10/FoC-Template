import { PrismaSupplierCatalogRepository } from '../../../src/infrastructure/persistence/prisma-supplier-catalog.repository.js';
import type { PrismaClient } from '../../../src/generated/prisma/client.js';
import { Prisma } from '../../../src/generated/prisma/client.js';
import type { CreateSupplierRecord } from '../../../src/application/ports/supplier-management.repository.port.js';

const SUPPLIER_ID = '30000000-0000-4000-8000-000000000001';
const UTOWN_LOCATION_ID = '40000000-0000-4000-8000-000000000001';
const SCIENCE_LOCATION_ID = '40000000-0000-4000-8000-000000000002';

describe('PrismaSupplierCatalogRepository', () => {
  it('looks for possible duplicates only in the selected building, floor and category', async () => {
    let query: unknown;
    const repository = new PrismaSupplierCatalogRepository({
      supplierLocation: {
        findMany: (args: unknown) => {
          query = args;
          return Promise.resolve([]);
        },
      },
    } as unknown as Pick<
      PrismaClient,
      '$transaction' | 'supplier' | 'supplierLocation'
    >);
    await expect(
      repository.findPossibleDuplicates({
        building: 'Engineering',
        floor: 1,
        category: 'FOOD_COFFEE',
      }),
    ).resolves.toEqual([]);
    expect(query).toMatchObject({
      where: {
        building: { equals: 'Engineering', mode: 'insensitive' },
        floor: 1,
        supplier: { category: 'FOOD_COFFEE', isActive: true },
      },
    });
  });

  it.each(['Science', 'Engineering'])(
    'adds Starbucks at %s to the existing supplier with canonical labels',
    async (building) => {
      let upsertArguments: unknown;
      let updateArguments: unknown;
      let transactionOptions: unknown;
      const existingLocations = [
        locationRecord(UTOWN_LOCATION_ID, 'UTown', 'Starbucks@UTown'),
      ];
      const transaction = {
        supplierLocation: { findMany: () => Promise.resolve([]) },
        supplier: {
          upsert: (args: unknown) => {
            upsertArguments = args;
            return Promise.resolve({
              id: SUPPLIER_ID,
              name: 'Starbucks',
              category: 'FOOD_COFFEE',
              isActive: true,
            });
          },
          update: (args: unknown) => {
            updateArguments = args;
            return Promise.resolve({
              id: SUPPLIER_ID,
              name: 'Starbucks',
              category: 'FOOD_COFFEE',
              locations: [
                ...existingLocations,
                locationRecord(
                  SCIENCE_LOCATION_ID,
                  building,
                  `Starbucks@${building}`,
                ),
              ],
            });
          },
        },
      };
      const repository = new PrismaSupplierCatalogRepository({
        $transaction: (
          callback: (tx: unknown) => Promise<unknown>,
          options: unknown,
        ) => {
          transactionOptions = options;
          return callback(transaction);
        },
      } as unknown as Pick<
        PrismaClient,
        '$transaction' | 'supplier' | 'supplierLocation'
      >);
      const record = createRecord(building);
      await expect(repository.createSupplier(record)).resolves.toMatchObject({
        id: SUPPLIER_ID,
        name: 'Starbucks',
        locations: [{ building: 'UTown' }, { building }],
      });
      expect(upsertArguments).toMatchObject({
        where: { name: 'starbucks' },
        update: {},
      });
      expect(updateArguments).toMatchObject({
        where: { id: SUPPLIER_ID },
        data: {
          locations: {
            create: { supplierAtLocation: `Starbucks@${building}` },
          },
        },
      });
      expect(transactionOptions).toEqual({ isolationLevel: 'Serializable' });
    },
  );

  it('maps the database outlet constraint to a non-overridable duplicate error', async () => {
    const repository = new PrismaSupplierCatalogRepository({
      $transaction: () =>
        Promise.reject(
          new Prisma.PrismaClientKnownRequestError('duplicate', {
            code: 'P2002',
            clientVersion: '7.10.0',
            meta: { target: ['supplier_at_location'] },
          }),
        ),
    } as unknown as Pick<
      PrismaClient,
      '$transaction' | 'supplier' | 'supplierLocation'
    >);
    await expect(
      repository.createSupplier(createRecord('UTown')),
    ).rejects.toMatchObject({
      code: 'SUPPLIER_ALREADY_EXISTS',
      field: 'supplierAtLocation',
    });
  });

  it('retries serialization conflicts before creating the outlet', async () => {
    let attempts = 0;
    const repository = new PrismaSupplierCatalogRepository({
      $transaction: () => {
        attempts += 1;
        if (attempts === 1)
          return Promise.reject(
            new Prisma.PrismaClientKnownRequestError('retry', {
              code: 'P2034',
              clientVersion: '7.10.0',
            }),
          );
        return Promise.resolve({
          id: SUPPLIER_ID,
          name: 'Starbucks',
          category: 'FOOD_COFFEE',
          locations: [],
        });
      },
    } as unknown as Pick<
      PrismaClient,
      '$transaction' | 'supplier' | 'supplierLocation'
    >);
    await expect(
      repository.createSupplier(createRecord('Engineering')),
    ).resolves.toMatchObject({ id: SUPPLIER_ID });
    expect(attempts).toBe(2);
  });

  it('lists one coordinate-backed option for each campus building', async () => {
    let findManyArguments: unknown;
    const findMany = (args: unknown): Promise<unknown[]> => {
      findManyArguments = args;
      return Promise.resolve([
        {
          building: 'Central Library',
          id: UTOWN_LOCATION_ID,
          latitude: { toNumber: (): number => 1.296444 },
          longitude: { toNumber: (): number => 103.773032 },
        },
      ]);
    };
    const repository = new PrismaSupplierCatalogRepository({
      supplierLocation: { findMany },
    } as unknown as Pick<
      PrismaClient,
      '$transaction' | 'supplier' | 'supplierLocation'
    >);

    await expect(repository.findCampusLocations()).resolves.toEqual([
      {
        building: 'Central Library',
        id: UTOWN_LOCATION_ID,
        latitude: 1.296444,
        longitude: 103.773032,
      },
    ]);
    expect(findManyArguments).toEqual({
      distinct: ['building'],
      orderBy: [{ building: 'asc' }, { id: 'asc' }],
      select: {
        building: true,
        id: true,
        latitude: true,
        longitude: true,
      },
    });
  });

  it('resolves a selected campus location to server-owned coordinates', async () => {
    let findUniqueArguments: unknown;
    const findUnique = (args: unknown): Promise<unknown> => {
      findUniqueArguments = args;
      return Promise.resolve({
        building: 'Science',
        id: SCIENCE_LOCATION_ID,
        latitude: { toNumber: (): number => 1.2966 },
        longitude: { toNumber: (): number => 103.7801 },
      });
    };
    const repository = new PrismaSupplierCatalogRepository({
      supplierLocation: { findUnique },
    } as unknown as Pick<
      PrismaClient,
      '$transaction' | 'supplier' | 'supplierLocation'
    >);

    await expect(
      repository.findCampusLocationById(SCIENCE_LOCATION_ID),
    ).resolves.toEqual({
      building: 'Science',
      id: SCIENCE_LOCATION_ID,
      latitude: 1.2966,
      longitude: 103.7801,
    });
    expect(findUniqueArguments).toEqual({
      select: {
        building: true,
        id: true,
        latitude: true,
        longitude: true,
      },
      where: { id: SCIENCE_LOCATION_ID },
    });
  });

  it('permanently deletes a supplier and its locations in one transaction', async () => {
    let deleteManyArguments: unknown;
    let deleteArguments: unknown;
    const deleteMany = (args: unknown): Promise<unknown> => {
      deleteManyArguments = args;
      return Promise.resolve({ count: 1 });
    };
    const deleteSupplier = (args: unknown): Promise<unknown> => {
      deleteArguments = args;
      return Promise.resolve({ id: SUPPLIER_ID });
    };
    const $transaction = (
      callback: (transaction: unknown) => Promise<unknown>,
    ): Promise<unknown> =>
      callback({
        supplier: { delete: deleteSupplier },
        supplierLocation: { deleteMany },
      });

    const repository = new PrismaSupplierCatalogRepository({
      $transaction,
      supplier: { delete: deleteSupplier },
      supplierLocation: { deleteMany },
    } as unknown as Pick<
      PrismaClient,
      '$transaction' | 'supplier' | 'supplierLocation'
    >);

    await expect(
      repository.deactivateSupplier(SUPPLIER_ID),
    ).resolves.toBeUndefined();
    expect(deleteManyArguments).toEqual({
      where: { supplierId: SUPPLIER_ID },
    });
    expect(deleteArguments).toEqual({
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
      $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
        callback({ supplier: { findUnique, update } }),
    } as unknown as Pick<
      PrismaClient,
      '$transaction' | 'supplier' | 'supplierLocation'
    >);

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
      if ((args as { select?: unknown }).select) return Promise.resolve(null);
      findFirstArguments = args;
      return Promise.resolve({
        ...locationRecord(UTOWN_LOCATION_ID, 'UTown', 'Starbucks@UTown'),
        supplier: { name: 'Starbucks', category: 'FOOD_COFFEE' },
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
      // Matching uses a separate query from loading the outlet being edited.
      $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          supplierLocation: {
            findFirst,
            findMany: () => Promise.resolve([]),
            update,
          },
        }),
    } as unknown as Pick<
      PrismaClient,
      '$transaction' | 'supplier' | 'supplierLocation'
    >);

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
      include: { supplier: { select: { name: true, category: true } } },
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

function createRecord(building: string): CreateSupplierRecord {
  return {
    name: 'starbucks',
    category: 'FOOD_COFFEE',
    location: {
      building,
      floor: 1,
      locationDescription: 'Main entrance',
      latitude: 1.3,
      longitude: 103.7,
      opensAt: new Date('1970-01-01T08:00:00Z'),
      closesAt: new Date('1970-01-01T20:00:00Z'),
      isOpenOvernight: false,
      imageUrl: null,
      supplierAtLocation: `starbucks@${building}`,
    },
  };
}
