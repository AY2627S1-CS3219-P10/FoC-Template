import type {
  CreateSupplierRecord,
  SupplierManagementRepositoryPort,
  UpdateSupplierRecord,
} from '../../../src/application/ports/supplier-management.repository.port.js';
import { DeactivateSupplierUseCase } from '../../../src/application/use-cases/deactivate-supplier.use-case.js';
import type { SupplierCatalogEntry } from '../../../src/domain/supplier-catalog.js';

const SUPPLIER_ID = '30000000-0000-4000-8000-000000000001';

class StubSupplierManagementRepository implements SupplierManagementRepositoryPort {
  readonly deactivatedSupplierIds: string[] = [];

  createSupplier(record: CreateSupplierRecord): Promise<SupplierCatalogEntry> {
    void record;
    throw new Error('Not used by these tests.');
  }

  deactivateSupplier(supplierId: string): Promise<void> {
    this.deactivatedSupplierIds.push(supplierId);
    return Promise.resolve();
  }

  updateSupplier(record: UpdateSupplierRecord): Promise<SupplierCatalogEntry> {
    void record;
    throw new Error('Not used by these tests.');
  }
}

describe('DeactivateSupplierUseCase', () => {
  it('deactivates the requested supplier', async () => {
    const repository = new StubSupplierManagementRepository();
    const useCase = new DeactivateSupplierUseCase(repository);

    await expect(useCase.execute(SUPPLIER_ID)).resolves.toBeUndefined();
    expect(repository.deactivatedSupplierIds).toEqual([SUPPLIER_ID]);
  });
});
