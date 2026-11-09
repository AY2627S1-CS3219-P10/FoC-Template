import { readFile, readdir } from 'node:fs/promises';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { PrismaSupplierCatalogRepository } from '../../src/infrastructure/persistence/prisma-supplier-catalog.repository.js';
import type { CreateSupplierRecord } from '../../src/application/ports/supplier-management.repository.port.js';
import { categoriesFromLegacy } from '../../src/domain/supplier-categories.js';

// Only supply a disposable, empty database; this suite applies migrations and resets fixtures.
const databaseUrl = process.env.SUPPLIER_OUTLET_TEST_URL;
const integration = databaseUrl ? describe : describe.skip;

integration('match and confirm against PostgreSQL', () => {
  let pool: Pool;
  let prisma: PrismaClient;
  let repository: PrismaSupplierCatalogRepository;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    const root = new URL('../../prisma/migrations/', import.meta.url);
    for (const entry of (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const before =
        entry.name === '20261108000100_supplier_category_tags'
          ? await pool.query(
              'SELECT id, category::text AS category FROM suppliers ORDER BY id',
            )
          : undefined;
      const outletsBefore = before
        ? await pool.query(
            'SELECT id, supplier_id FROM supplier_locations ORDER BY id',
          )
        : undefined;
      await pool.query(
        await readFile(new URL(`${entry.name}/migration.sql`, root), 'utf8'),
      );
      if (before) {
        const after = await pool.query(
          'SELECT id, category::text AS category, categories::text[] AS categories FROM suppliers ORDER BY id',
        );
        expect(after.rows).toEqual(
          before.rows.map(
            (row: {
              id: string;
              category: Parameters<typeof categoriesFromLegacy>[0];
            }) => ({
              ...row,
              categories: categoriesFromLegacy(row.category),
            }),
          ),
        );
        expect(
          (
            await pool.query(
              'SELECT id, supplier_id FROM supplier_locations ORDER BY id',
            )
          ).rows,
        ).toEqual(outletsBefore?.rows);
      }
    }
    // Check the seeded catalog before per-test cleanup removes it.
    const cafeNames = [
      'Starbucks @ S9',
      'Starbucks @ CDE',
      'Starbucks @ UTown',
      'Poonsti Cafe',
      'The Coffee Bean and Tea Leaf',
      'TOMORO COFFEE',
      'TOMORO COFFEE @ NUS College',
      'he by He Brews',
      'Techno Edge',
      'Wonderful Cafe @ CDE',
      'Wonderful Cafe @ S16',
    ];
    const corrected = await pool.query<{
      name: string;
      category: string;
      categories: string[];
    }>(
      'SELECT name, category::text AS category, categories::text[] AS categories FROM suppliers WHERE name = ANY($1::citext[])',
      [cafeNames],
    );
    expect(corrected.rows).toHaveLength(cafeNames.length);
    for (const supplier of corrected.rows) {
      const foodOnly = supplier.name.startsWith('Wonderful Cafe');
      expect(supplier.categories).toEqual(
        foodOnly ? ['FOOD'] : ['FOOD', 'BEVERAGES'],
      );
      expect(supplier.category).toBe(foodOnly ? 'FOOD' : 'FOOD_COFFEE');
    }
    const both = [
      'Cool Spot',
      'Mr Bean / Do Qoo',
      'Nine Fresh',
      'Fine Food',
      'Flavours @ UTown',
      'Central Square @ YIH',
    ];
    const beveragesOnly = ['Mixue', 'CHAGEE', 'Cafe+ Robot Cafe'];
    const refined = await pool.query<{ name: string; categories: string[] }>(
      'SELECT name, categories::text[] AS categories FROM suppliers WHERE name = ANY($1::citext[])',
      [[...both, ...beveragesOnly]],
    );
    expect(refined.rows).toHaveLength(both.length + beveragesOnly.length);
    for (const supplier of refined.rows) {
      expect(supplier.categories).toEqual(
        both.includes(supplier.name) ? ['FOOD', 'BEVERAGES'] : ['BEVERAGES'],
      );
    }
    const technoEdge = await pool.query<{
      floor: number | null;
      latitude: string | null;
      longitude: string | null;
    }>(
      "SELECT location.floor, location.latitude, location.longitude FROM supplier_locations AS location JOIN suppliers AS supplier ON supplier.id = location.supplier_id WHERE supplier.name = 'Techno Edge'",
    );
    expect(technoEdge.rows).toEqual([
      { floor: null, latitude: null, longitude: null },
    ]);
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
    repository = new PrismaSupplierCatalogRepository(prisma);
  }, 30000);

  beforeEach(async () => {
    await prisma.supplierLocation.deleteMany();
    await prisma.supplier.deleteMany();
  });
  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
  });

  it('includes a cafe in both filters and excludes inactive suppliers and outlets', async () => {
    const cafe = await repository.createSupplier({
      ...record('Cafe', 'CLB', 1),
      category: 'FOOD_COFFEE',
      categories: ['FOOD', 'BEVERAGES'],
    });
    const food = await repository.createSupplier({
      ...record('Food', 'Other', 1),
      category: 'FOOD',
      categories: ['FOOD'],
    });
    const drinks = await repository.createSupplier({
      ...record('Drinks', 'Other', 2),
      category: 'FOOD_COFFEE',
      categories: ['BEVERAGES'],
    });
    const printing = await repository.createSupplier(
      record('Print', 'Print building', 1),
    );
    const ids = (suppliers: { id: string }[]): string[] =>
      suppliers.map((supplier) => supplier.id).sort();
    expect(ids(await repository.findActiveSuppliers('FOOD'))).toEqual(
      [cafe.id, food.id].sort(),
    );
    expect(ids(await repository.findActiveSuppliers('BEVERAGES'))).toEqual(
      [cafe.id, drinks.id].sort(),
    );
    expect(ids(await repository.findActiveSuppliers('PRINTING'))).toEqual([
      printing.id,
    ]);
    expect(await repository.findActiveSuppliers('SHOPPING')).toEqual([]);
    expect(await repository.findActiveSuppliers()).toHaveLength(4);
    await prisma.supplier.update({
      where: { id: cafe.id },
      data: { isActive: false },
    });
    await prisma.supplierLocation.updateMany({
      where: { supplierId: drinks.id },
      data: { isActive: false },
    });
    expect(await repository.findActiveSuppliers('BEVERAGES')).toEqual([]);
    expect(ids(await repository.findActiveSuppliers('FOOD'))).toEqual([
      food.id,
    ]);
  });

  it('stores both food and beverages, then replaces tags without changing outlet IDs', async () => {
    const cafe = await repository.createSupplier({
      ...record('Cafe', 'CLB', 1),
      category: 'FOOD_COFFEE',
      categories: ['BEVERAGES', 'FOOD'],
    });
    expect(cafe.categories).toEqual(['FOOD', 'BEVERAGES']);
    const drinks = await repository.updateSupplier({
      id: cafe.id,
      categories: ['BEVERAGES'],
    });
    expect(drinks.categories).toEqual(['BEVERAGES']);
    expect(drinks.locations.map((location) => location.id)).toEqual(
      cafe.locations.map((location) => location.id),
    );
    const renamed = await repository.updateSupplier({
      id: cafe.id,
      name: 'Drinks',
    });
    expect(renamed.categories).toEqual(['BEVERAGES']);
    expect((await repository.findActiveSuppliers())[0]?.categories).toEqual([
      'BEVERAGES',
    ]);
    await expect(
      repository.updateSupplier({ id: cafe.id, category: 'FOOD' }),
    ).resolves.toMatchObject({ categories: ['FOOD'] });
  });

  it('detects overlapping categories during creates, category changes and moves', async () => {
    const cafe = await repository.createSupplier({
      ...record('Cafe', 'CLB', 1, 'Cafe door'),
      category: 'FOOD_COFFEE',
      categories: ['FOOD', 'BEVERAGES'],
    });
    await expect(
      repository.createSupplier({
        ...record('Drinks', 'CLB', 1),
        category: 'FOOD_COFFEE',
        categories: ['BEVERAGES'],
      }),
    ).rejects.toMatchObject({ code: 'POSSIBLE_SUPPLIER_DUPLICATE' });
    const drinks = await repository.createSupplier({
      ...record('Drinks', 'Other', 1),
      category: 'FOOD_COFFEE',
      categories: ['BEVERAGES'],
    });
    await expect(
      repository.updateSupplierLocation({
        supplierId: drinks.id,
        locationId: drinks.locations[0]!.id,
        building: 'CLB',
      }),
    ).rejects.toMatchObject({ code: 'POSSIBLE_SUPPLIER_DUPLICATE' });
    const shop = await repository.createSupplier({
      ...record('Shop', 'CLB', 1),
      category: 'SHOPPING',
    });
    await expect(
      repository.updateSupplier({ id: shop.id, categories: ['BEVERAGES'] }),
    ).rejects.toMatchObject({ code: 'POSSIBLE_SUPPLIER_DUPLICATE' });
    expect(
      (await repository.findActiveSuppliers()).find(
        (supplier) => supplier.id === cafe.id,
      )?.categories,
    ).toEqual(['FOOD', 'BEVERAGES']);
  });

  it('compares all tags when adding an outlet, independently of input order', async () => {
    const cafe = await repository.createSupplier({
      ...record('Cafe', 'CLB', 1),
      category: 'FOOD_COFFEE',
      categories: ['FOOD', 'BEVERAGES'],
    });
    await expect(
      repository.createSupplier({
        ...record('Cafe', 'Other', 1),
        category: 'FOOD_COFFEE',
        categories: ['BEVERAGES'],
      }),
    ).rejects.toMatchObject({ code: 'SUPPLIER_CATEGORY_MISMATCH' });
    await expect(
      repository.createSupplier({
        ...record('Cafe', 'Other', 1),
        category: 'FOOD_COFFEE',
        categories: ['BEVERAGES', 'FOOD'],
      }),
    ).resolves.toMatchObject({
      id: cafe.id,
      categories: ['FOOD', 'BEVERAGES'],
    });
  });

  it('enforces nonempty unique tags and legacy compatibility in PostgreSQL', async () => {
    const supplier = await repository.createSupplier(
      record('Printing', 'CLB', 1),
    );
    for (const categories of [[], ['PRINTING', 'PRINTING'], [null], ['FOOD']]) {
      await expect(
        pool.query(
          'UPDATE suppliers SET categories = $1::supplier_tag[] WHERE id = $2',
          [categories, supplier.id],
        ),
      ).rejects.toThrow();
    }
    expect((await repository.findActiveSuppliers())[0]?.categories).toEqual([
      'PRINTING',
    ]);
  });

  it('allows new buildings and floors under the same case-insensitive supplier name', async () => {
    const first = await repository.createSupplier(
      record('MedSci Printing', 'MedSci', 1),
    );
    const second = await repository.createSupplier(
      record('medsci printing', 'MedSci', 2),
    );
    const third = await repository.createSupplier(
      record('MedSci Printing', 'CLB', 1),
    );
    expect(second.id).toBe(first.id);
    expect(third.id).toBe(first.id);
    expect(await prisma.supplierLocation.count()).toBe(3);
  });

  it('returns names and descriptions, then allows a confirmed separate pickup point on the same floor', async () => {
    const first = await repository.createSupplier(
      record('CLB Printing', 'CLB', 4, 'Beside the lift'),
    );
    const second = record(
      'Printing at CLB',
      'clb',
      4,
      'Opposite the study area',
    );
    await expect(repository.createSupplier(second)).rejects.toMatchObject({
      code: 'POSSIBLE_SUPPLIER_DUPLICATE',
      matches: [
        {
          supplierName: 'CLB Printing',
          locationDescription: 'Beside the lift',
          floor: 4,
        },
      ],
    });
    expect(await prisma.supplier.count()).toBe(1);
    const other = await repository.createSupplier({
      ...second,
      confirmDistinctOutlet: true,
    });
    expect(other.id).not.toBe(first.id);
    expect(await prisma.supplierLocation.count()).toBe(2);
  });

  it('allows the same supplier to have distinct points on one floor but never the exact point twice', async () => {
    const first = await repository.createSupplier(
      record('CLB Printing', 'CLB', 4, 'Beside the lift'),
    );
    const second = record('clb printing', 'CLB', 4, 'Near staircase');
    const other = await repository.createSupplier({
      ...second,
      confirmDistinctOutlet: true,
    });
    expect(other.id).toBe(first.id);
    await expect(
      repository.createSupplier({
        ...record('Another alias', 'CLB', 4, '  BESIDE   THE LIFT  '),
        confirmDistinctOutlet: true,
      }),
    ).rejects.toMatchObject({ code: 'SUPPLIER_ALREADY_EXISTS' });
    expect(await prisma.supplierLocation.count()).toBe(2);
  });

  it('requires confirmation for moves and category changes, and allows distinct descriptions after review', async () => {
    await repository.createSupplier(
      record('CLB Printing', 'CLB', 4, 'Beside the lift'),
    );
    const remote = await repository.createSupplier(
      record('Other printing', 'MedSci', 4, 'Near staircase'),
    );
    const move = {
      supplierId: remote.id,
      locationId: remote.locations[0]!.id,
      building: 'CLB',
    };
    await expect(repository.updateSupplierLocation(move)).rejects.toMatchObject(
      { code: 'POSSIBLE_SUPPLIER_DUPLICATE' },
    );
    await expect(
      repository.updateSupplierLocation({
        ...move,
        confirmDistinctOutlet: true,
      }),
    ).resolves.toMatchObject({ building: 'CLB' });
    const shop = record('Shop', 'CLB', 4, 'Opposite study area');
    shop.category = 'SHOPPING';
    const owner = await repository.createSupplier(shop);
    await expect(
      repository.updateSupplier({ id: owner.id, category: 'PRINTING' }),
    ).rejects.toMatchObject({ code: 'POSSIBLE_SUPPLIER_DUPLICATE' });
    await expect(
      repository.updateSupplier({
        id: owner.id,
        category: 'PRINTING',
        confirmDistinctOutlet: true,
      }),
    ).resolves.toMatchObject({ category: 'PRINTING' });
  });

  it('rechecks simultaneous unconfirmed requests and returns a match for one', async () => {
    const results = await Promise.allSettled([
      repository.createSupplier(
        record('First printing', 'CLB', 4, 'Lift lobby'),
      ),
      repository.createSupplier(
        record('Second printing', 'CLB', 4, 'Staircase'),
      ),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === 'rejected'),
    ).toMatchObject({ reason: { code: 'POSSIBLE_SUPPLIER_DUPLICATE' } });
    expect(await prisma.supplierLocation.count()).toBe(1);
  });

  it('allows confirmed simultaneous distinct points but blocks simultaneous exact duplicates', async () => {
    const results = await Promise.all([
      repository.createSupplier({
        ...record('CLB Printing', 'CLB', 4, 'Lift lobby'),
        confirmDistinctOutlet: true,
      }),
      repository.createSupplier({
        ...record('CLB Printing', 'CLB', 4, 'Staircase'),
        confirmDistinctOutlet: true,
      }),
    ]);
    expect(results[0].id).toBe(results[1].id);
    const duplicates = await Promise.allSettled([
      repository.createSupplier({
        ...record('First alias', 'CLB', 4, 'Study area'),
        confirmDistinctOutlet: true,
      }),
      repository.createSupplier({
        ...record('Second alias', 'CLB', 4, 'Study area'),
        confirmDistinctOutlet: true,
      }),
    ]);
    expect(
      duplicates.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      duplicates.find((result) => result.status === 'rejected'),
    ).toMatchObject({ reason: { code: 'SUPPLIER_ALREADY_EXISTS' } });
    expect(await prisma.supplierLocation.count()).toBe(3);
  });
});

function record(
  name: string,
  building: string,
  floor: number,
  description = 'Main entrance',
): CreateSupplierRecord {
  return {
    name,
    category: 'PRINTING',
    location: {
      building,
      floor,
      locationDescription: description,
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
