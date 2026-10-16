import { readFile, readdir } from 'node:fs/promises';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { PrismaSupplierCatalogRepository } from '../../src/infrastructure/persistence/prisma-supplier-catalog.repository.js';
import type { CreateSupplierRecord } from '../../src/application/ports/supplier-management.repository.port.js';

// Only use a disposable, empty database: these tests apply all migrations.
const databaseUrl = process.env.SUPPLIER_OUTLET_TEST_URL;
const integration = databaseUrl ? describe : describe.skip;

integration('outlet identity against PostgreSQL', () => {
  let pool: Pool;
  let prisma: PrismaClient;
  let repository: PrismaSupplierCatalogRepository;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    const migrationsRoot = new URL('../../prisma/migrations/', import.meta.url);
    const migrations = await readdir(migrationsRoot, { withFileTypes: true });
    for (const migration of migrations
      .filter((entry) => entry.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))) {
      await pool.query(
        await readFile(
          new URL(`${migration.name}/migration.sql`, migrationsRoot),
          'utf8',
        ),
      );
    }
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
    repository = new PrismaSupplierCatalogRepository(prisma);
  }, 30000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
  });

  it('adds new buildings and floors to one brand and blocks repeated building-floor pairs', async () => {
    const name = 'Outlet identity test Starbucks';
    const utown = await repository.createSupplier(record(name, 'UTown'));
    const science = await repository.createSupplier(
      record(name.toLowerCase(), 'Science'),
    );
    const engineering = await repository.createSupplier(
      record(name, 'Engineering'),
    );
    expect(science.id).toBe(utown.id);
    expect(engineering.id).toBe(utown.id);
    expect(
      engineering.locations.map((location) => location.building).sort(),
    ).toEqual(['Engineering', 'Science', 'UTown']);

    const duplicate = record(name.toUpperCase(), 'UTown');
    duplicate.location.locationDescription = 'A different description';
    await expect(repository.createSupplier(duplicate)).rejects.toMatchObject({
      code: 'SUPPLIER_ALREADY_EXISTS',
      field: 'supplierAtLocation',
    });
    const anotherFloor = record(name, 'UTown');
    anotherFloor.location.floor = 4;
    await expect(
      repository.createSupplier(anotherFloor),
    ).resolves.toMatchObject({ id: utown.id });
    await expect(repository.createSupplier(anotherFloor)).rejects.toMatchObject(
      { code: 'SUPPLIER_ALREADY_EXISTS' },
    );
    const sameFloorDifferentCase = record(name, 'utown');
    await expect(
      repository.createSupplier(sameFloorDifferentCase),
    ).rejects.toMatchObject({ code: 'SUPPLIER_ALREADY_EXISTS' });
    await expect(
      repository.updateSupplierLocation({
        supplierId: utown.id,
        locationId: science.locations.find(
          (location) => location.building === 'Science',
        )!.id,
        building: 'UTown',
      }),
    ).rejects.toMatchObject({ code: 'SUPPLIER_ALREADY_EXISTS' });
    const scienceLocationId = science.locations.find(
      (location) => location.building === 'Science',
    )!.id;
    await expect(
      repository.updateSupplierLocation({
        supplierId: utown.id,
        locationId: scienceLocationId,
        building: 'UTown',
        floor: 5,
      }),
    ).resolves.toMatchObject({ building: 'UTown', floor: 5 });
    await expect(
      repository.updateSupplierLocation({
        supplierId: utown.id,
        locationId: scienceLocationId,
        floor: 4,
      }),
    ).rejects.toMatchObject({ code: 'SUPPLIER_ALREADY_EXISTS' });
    const mismatch = record(name, 'COM1');
    mismatch.category = 'PRINTING';
    await expect(repository.createSupplier(mismatch)).rejects.toMatchObject({
      code: 'SUPPLIER_CATEGORY_MISMATCH',
    });
  });

  it('allows only one concurrent creation of the same brand and building', async () => {
    const name = 'Concurrent same outlet test';
    const results = await Promise.allSettled([
      repository.createSupplier(record(name, 'UTown')),
      repository.createSupplier(record(name.toLowerCase(), 'UTown')),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === 'rejected'),
    ).toMatchObject({ reason: { code: 'SUPPLIER_ALREADY_EXISTS' } });
    expect(await prisma.supplier.count({ where: { name } })).toBe(1);
    expect(
      await prisma.supplierLocation.count({ where: { supplier: { name } } }),
    ).toBe(1);
  });

  it('preserves two concurrent new outlets under the same supplier', async () => {
    const name = 'Concurrent different outlets test';
    const [utown, science] = await Promise.all([
      repository.createSupplier(record(name, 'UTown')),
      repository.createSupplier(record(name.toLowerCase(), 'Science')),
    ]);
    expect(science.id).toBe(utown.id);
    expect(
      await prisma.supplierLocation.count({ where: { supplierId: utown.id } }),
    ).toBe(2);
  });

  it('allows concurrent outlets on different floors in the same building', async () => {
    const name = 'CLB printing floor test';
    const level4 = record(name, 'Central Library');
    level4.category = 'PRINTING';
    level4.location.floor = 4;
    const level5 = record(name, 'Central Library');
    level5.category = 'PRINTING';
    level5.location.floor = 5;
    const [first, second] = await Promise.all([
      repository.createSupplier(level4),
      repository.createSupplier(level5),
    ]);
    expect(first.id).toBe(second.id);
    expect(
      await prisma.supplierLocation.count({ where: { supplierId: first.id } }),
    ).toBe(2);
  });
});

function record(name: string, building: string): CreateSupplierRecord {
  return {
    name,
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
      supplierAtLocation: `${name}@${building}`,
    },
  };
}
