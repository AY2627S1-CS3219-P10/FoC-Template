import { readFile, readdir } from 'node:fs/promises';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { PrismaSupplierCatalogRepository } from '../../src/infrastructure/persistence/prisma-supplier-catalog.repository.js';
import type { CreateSupplierRecord } from '../../src/application/ports/supplier-management.repository.port.js';

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
      await pool.query(
        await readFile(new URL(`${entry.name}/migration.sql`, root), 'utf8'),
      );
    }
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
