import type {
  CreateSupplierRecord,
  SupplierManagementRepositoryPort,
  UpdateSupplierRecord,
} from '../../../src/application/ports/supplier-management.repository.port.js';
import { UpdateSupplierUseCase } from '../../../src/application/use-cases/update-supplier.use-case.js';
import type { SupplierCatalogEntry } from '../../../src/domain/supplier-catalog.js';

const SUPPLIER_ID = '30000000-0000-4000-8000-000000000001';

class StubSupplierManagementRepository implements SupplierManagementRepositoryPort {
  readonly records: UpdateSupplierRecord[] = [];

  createSupplier(record: CreateSupplierRecord): Promise<SupplierCatalogEntry> {
    void record;
    throw new Error('Not used by these tests.');
  }

  updateSupplier(record: UpdateSupplierRecord): Promise<SupplierCatalogEntry> {
    this.records.push(record);

    return Promise.resolve({
      category: record.category ?? 'FOOD_COFFEE',
      id: record.id,
      locations: [],
      name: record.name ?? 'Starbucks',
    });
  }
}

describe('UpdateSupplierUseCase', () => {
  it('normalizes and updates a supplier name and category', async () => {
    const repository = new StubSupplierManagementRepository();
    const useCase = new UpdateSupplierUseCase(repository);

    await expect(
      useCase.execute(SUPPLIER_ID, {
        category: 'FOOD_COFFEE',
        name: ' Starbucks Coffee ',
      }),
    ).resolves.toMatchObject({
      category: 'FOOD_COFFEE',
      name: 'Starbucks Coffee',
    });
    expect(repository.records).toEqual([
      {
        category: 'FOOD_COFFEE',
        id: SUPPLIER_ID,
        name: 'Starbucks Coffee',
      },
    ]);
  });

  it('supports updating only the category', async () => {
    const repository = new StubSupplierManagementRepository();
    const useCase = new UpdateSupplierUseCase(repository);

    await useCase.execute(SUPPLIER_ID, { category: 'SHOPPING' });

    expect(repository.records).toEqual([
      {
        category: 'SHOPPING',
        id: SUPPLIER_ID,
        name: undefined,
      },
    ]);
  });

  it.each([
    [{}, 'SUPPLIER_UPDATE_EMPTY'],
    [{ name: '   ' }, 'NAME_REQUIRED'],
    [{ category: 'OTHER' }, 'CATEGORY_INVALID'],
  ])('rejects an invalid update with %s', async (input, code) => {
    const repository = new StubSupplierManagementRepository();
    const useCase = new UpdateSupplierUseCase(repository);

    await expect(useCase.execute(SUPPLIER_ID, input)).rejects.toMatchObject({
      code,
    });
    expect(repository.records).toHaveLength(0);
  });
});
