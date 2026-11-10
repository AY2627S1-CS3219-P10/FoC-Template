// AI-assisted portions: supplier categories (OpenAI Codex, GPT-6.1). Human review confirmed by the team, 2026-11-10. See /ai/usage-log.md.
import type { SupplierCatalogRepositoryPort } from '../../../src/application/ports/supplier-catalog.repository.port.js';
import { ListSuppliersUseCase } from '../../../src/application/use-cases/list-suppliers.use-case.js';
import type { SupplierCatalogEntry } from '../../../src/domain/supplier-catalog.js';
import type { SupplierTag } from '../../../src/domain/supplier-categories.js';

const CATALOG: SupplierCatalogEntry[] = [
  {
    category: 'SHOPPING',
    categories: ['SHOPPING'],
    id: '10000000-0000-4000-8000-000000000002',
    locations: [
      {
        building: 'Central Library',
        closesAt: '16:00',
        floor: 1,
        id: '20000000-0000-4000-8000-000000000002',
        imageUrl: null,
        isOpenOvernight: false,
        latitude: 1.2967866,
        locationDescription: 'Inside the library on the right side',
        longitude: 103.7732677,
        opensAt: '09:00',
        supplierAtLocation: 'NUS Co-op@Central Library',
      },
    ],
    name: 'NUS Co-op',
  },
];

class StubSupplierCatalogRepository implements SupplierCatalogRepositoryPort {
  calls = 0;
  category?: SupplierTag;

  findActiveSuppliers(category?: SupplierTag): Promise<SupplierCatalogEntry[]> {
    this.calls += 1;
    this.category = category;
    return Promise.resolve(CATALOG);
  }

  findCampusLocations(): Promise<never> {
    throw new Error('Not used by these tests.');
  }
}

describe('ListSuppliersUseCase', () => {
  it('forwards the tag filter to persistence', async () => {
    const repository = new StubSupplierCatalogRepository();
    await new ListSuppliersUseCase(repository).execute('BEVERAGES');
    expect(repository.category).toBe('BEVERAGES');
  });
  it('returns the active supplier catalog from its repository', async () => {
    const repository = new StubSupplierCatalogRepository();
    const useCase = new ListSuppliersUseCase(repository);

    await expect(useCase.execute()).resolves.toEqual(CATALOG);
    expect(repository.calls).toBe(1);
  });
});
