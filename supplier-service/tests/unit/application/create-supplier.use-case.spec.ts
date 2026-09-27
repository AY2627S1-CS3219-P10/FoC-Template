import type {
  CreateSupplierRecord,
  SupplierManagementRepositoryPort,
  UpdateSupplierLocationRecord,
  UpdateSupplierRecord,
} from '../../../src/application/ports/supplier-management.repository.port.js';
import { CreateSupplierUseCase } from '../../../src/application/use-cases/create-supplier.use-case.js';
import type {
  CampusLocationCatalogEntry,
  SupplierCatalogEntry,
} from '../../../src/domain/supplier-catalog.js';
import { SupplierValidationError } from '../../../src/domain/supplier-validation.error.js';

const CAMPUS_LOCATION: CampusLocationCatalogEntry = {
  building: 'UTown',
  id: '20000000-0000-4000-8000-000000000001',
  latitude: 1.3048,
  longitude: 103.7739,
};
const INPUT = {
  category: 'FOOD_COFFEE',
  location: {
    campusLocationId: CAMPUS_LOCATION.id,
    closesAt: '02:00',
    floor: 1,
    imageUrl: ' https://example.com/starbucks-utown.jpg ',
    locationDescription: ' Near the main entrance ',
    opensAt: '08:00',
  },
  name: ' Starbucks ',
};

class StubSupplierManagementRepository implements SupplierManagementRepositoryPort {
  readonly records: CreateSupplierRecord[] = [];

  createSupplier(record: CreateSupplierRecord): Promise<SupplierCatalogEntry> {
    this.records.push(record);
    return Promise.resolve({
      category: record.category,
      id: '30000000-0000-4000-8000-000000000001',
      locations: [],
      name: record.name,
    });
  }

  deactivateSupplier(supplierId: string): Promise<void> {
    void supplierId;
    throw new Error('Not used by these tests.');
  }

  findCampusLocationById(
    campusLocationId: string,
  ): Promise<CampusLocationCatalogEntry | null> {
    return Promise.resolve(
      campusLocationId === CAMPUS_LOCATION.id ? CAMPUS_LOCATION : null,
    );
  }

  updateSupplier(record: UpdateSupplierRecord): Promise<SupplierCatalogEntry> {
    void record;
    throw new Error('Not used by these tests.');
  }

  updateSupplierLocation(record: UpdateSupplierLocationRecord): Promise<never> {
    void record;
    throw new Error('Not used by these tests.');
  }
}

describe('CreateSupplierUseCase', () => {
  it('normalizes and creates a supplier with its first location', async () => {
    const repository = new StubSupplierManagementRepository();
    const useCase = new CreateSupplierUseCase(repository);

    await expect(useCase.execute(INPUT)).resolves.toMatchObject({
      category: 'FOOD_COFFEE',
      name: 'Starbucks',
    });
    expect(repository.records).toEqual([
      {
        category: 'FOOD_COFFEE',
        location: {
          building: 'UTown',
          closesAt: new Date('1970-01-01T02:00:00.000Z'),
          floor: 1,
          imageUrl: 'https://example.com/starbucks-utown.jpg',
          isOpenOvernight: true,
          latitude: 1.3048,
          locationDescription: 'Near the main entrance',
          longitude: 103.7739,
          opensAt: new Date('1970-01-01T08:00:00.000Z'),
          supplierAtLocation: 'Starbucks@UTown',
        },
        name: 'Starbucks',
      },
    ]);
  });

  it.each([
    [{ ...INPUT, category: 'OTHER' }, 'CATEGORY_INVALID'],
    [
      { ...INPUT, location: { ...INPUT.location, opensAt: '8am' } },
      'OPENSAT_INVALID_FORMAT',
    ],
    [
      {
        ...INPUT,
        location: { ...INPUT.location, campusLocationId: 'not-a-uuid' },
      },
      'CAMPUS_LOCATION_ID_INVALID',
    ],
    [{ ...INPUT, location: { ...INPUT.location, floor: -1 } }, 'FLOOR_INVALID'],
    [
      {
        ...INPUT,
        location: { ...INPUT.location, imageUrl: 'javascript:alert(1)' },
      },
      'IMAGE_URL_INVALID',
    ],
  ])('rejects invalid supplier input with %s', async (input, code) => {
    const repository = new StubSupplierManagementRepository();
    const useCase = new CreateSupplierUseCase(repository);

    await expect(useCase.execute(input)).rejects.toMatchObject({ code });
    expect(repository.records).toHaveLength(0);
  });

  it('rejects an empty supplier name', async () => {
    const useCase = new CreateSupplierUseCase(
      new StubSupplierManagementRepository(),
    );

    await expect(
      useCase.execute({ ...INPUT, name: '   ' }),
    ).rejects.toBeInstanceOf(SupplierValidationError);
  });

  it('rejects a valid location id that is not in the campus catalog', async () => {
    const repository = new StubSupplierManagementRepository();
    const useCase = new CreateSupplierUseCase(repository);

    await expect(
      useCase.execute({
        ...INPUT,
        location: {
          ...INPUT.location,
          campusLocationId: '20000000-0000-4000-8000-000000000099',
        },
      }),
    ).rejects.toMatchObject({ code: 'CAMPUS_LOCATION_NOT_FOUND' });
    expect(repository.records).toHaveLength(0);
  });
});
