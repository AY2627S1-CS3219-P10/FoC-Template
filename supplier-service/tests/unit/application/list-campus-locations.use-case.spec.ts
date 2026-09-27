import type { SupplierCatalogRepositoryPort } from '../../../src/application/ports/supplier-catalog.repository.port.js';
import { ListCampusLocationsUseCase } from '../../../src/application/use-cases/list-campus-locations.use-case.js';
import type {
  CampusLocationCatalogEntry,
  SupplierCatalogEntry,
} from '../../../src/domain/supplier-catalog.js';

const CAMPUS_LOCATIONS: CampusLocationCatalogEntry[] = [
  {
    building: 'Central Library',
    id: '20000000-0000-4000-8000-000000000001',
    latitude: 1.296444,
    longitude: 103.773032,
  },
];

class StubSupplierCatalogRepository implements SupplierCatalogRepositoryPort {
  calls = 0;

  findActiveSuppliers(): Promise<SupplierCatalogEntry[]> {
    return Promise.reject(new Error('Not used by these tests.'));
  }

  findCampusLocations(): Promise<CampusLocationCatalogEntry[]> {
    this.calls += 1;
    return Promise.resolve(CAMPUS_LOCATIONS);
  }
}

describe('ListCampusLocationsUseCase', () => {
  it('returns the fixed campus-location catalog from its repository', async () => {
    const repository = new StubSupplierCatalogRepository();
    const useCase = new ListCampusLocationsUseCase(repository);

    await expect(useCase.execute()).resolves.toEqual(CAMPUS_LOCATIONS);
    expect(repository.calls).toBe(1);
  });
});
