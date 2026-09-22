import type {
  CreateSupplierRecord,
  SupplierManagementRepositoryPort,
  UpdateSupplierLocationRecord,
  UpdateSupplierRecord,
} from '../../../src/application/ports/supplier-management.repository.port.js';
import { UpdateSupplierLocationUseCase } from '../../../src/application/use-cases/update-supplier-location.use-case.js';
import type {
  SupplierCatalogEntry,
  SupplierLocationCatalogEntry,
} from '../../../src/domain/supplier-catalog.js';

const SUPPLIER_ID = '30000000-0000-4000-8000-000000000001';
const LOCATION_ID = '40000000-0000-4000-8000-000000000001';

class StubSupplierManagementRepository implements SupplierManagementRepositoryPort {
  readonly locationRecords: UpdateSupplierLocationRecord[] = [];

  createSupplier(record: CreateSupplierRecord): Promise<SupplierCatalogEntry> {
    void record;
    throw new Error('Not used by these tests.');
  }

  deactivateSupplier(supplierId: string): Promise<void> {
    void supplierId;
    throw new Error('Not used by these tests.');
  }

  updateSupplier(record: UpdateSupplierRecord): Promise<SupplierCatalogEntry> {
    void record;
    throw new Error('Not used by these tests.');
  }

  updateSupplierLocation(
    record: UpdateSupplierLocationRecord,
  ): Promise<SupplierLocationCatalogEntry> {
    this.locationRecords.push(record);

    return Promise.resolve({
      building: record.building ?? 'UTown',
      closesAt: '21:00',
      floor: record.floor ?? 1,
      id: record.locationId,
      imageUrl: record.imageUrl ?? null,
      isOpenOvernight: false,
      latitude: record.latitude ?? 1.3048,
      locationDescription:
        record.locationDescription ?? 'Near the main entrance',
      longitude: record.longitude ?? 103.7739,
      opensAt: '09:00',
      supplierAtLocation: `Starbucks@${record.building ?? 'UTown'}`,
    });
  }
}

describe('UpdateSupplierLocationUseCase', () => {
  it('normalizes and validates replacement location details', async () => {
    const repository = new StubSupplierManagementRepository();
    const useCase = new UpdateSupplierLocationUseCase(repository);

    await expect(
      useCase.execute(SUPPLIER_ID, LOCATION_ID, {
        building: ' Science ',
        closesAt: '21:00',
        floor: 2,
        imageUrl: ' https://example.com/starbucks-science.jpg ',
        latitude: 1.2966,
        locationDescription: ' Beside the main entrance ',
        longitude: 103.7801,
        opensAt: '09:00',
      }),
    ).resolves.toMatchObject({
      building: 'Science',
      supplierAtLocation: 'Starbucks@Science',
    });
    expect(repository.locationRecords).toEqual([
      {
        building: 'Science',
        closesAt: new Date('1970-01-01T21:00:00.000Z'),
        floor: 2,
        imageUrl: 'https://example.com/starbucks-science.jpg',
        latitude: 1.2966,
        locationDescription: 'Beside the main entrance',
        locationId: LOCATION_ID,
        longitude: 103.7801,
        opensAt: new Date('1970-01-01T09:00:00.000Z'),
        supplierId: SUPPLIER_ID,
      },
    ]);
  });

  it('supports clearing the optional image', async () => {
    const repository = new StubSupplierManagementRepository();
    const useCase = new UpdateSupplierLocationUseCase(repository);

    await useCase.execute(SUPPLIER_ID, LOCATION_ID, { imageUrl: null });

    expect(repository.locationRecords).toEqual([
      expect.objectContaining({ imageUrl: null }),
    ]);
  });

  it.each([
    [{}, 'SUPPLIER_LOCATION_UPDATE_EMPTY'],
    [{ building: '   ' }, 'BUILDING_REQUIRED'],
    [{ floor: -1 }, 'FLOOR_INVALID'],
    [{ latitude: 91 }, 'LATITUDE_INVALID'],
    [{ opensAt: '9am' }, 'OPENSAT_INVALID_FORMAT'],
    [{ imageUrl: 'javascript:alert(1)' }, 'IMAGE_URL_INVALID'],
  ])('rejects an invalid location update with %s', async (input, code) => {
    const repository = new StubSupplierManagementRepository();
    const useCase = new UpdateSupplierLocationUseCase(repository);

    await expect(
      useCase.execute(SUPPLIER_ID, LOCATION_ID, input),
    ).rejects.toMatchObject({ code });
    expect(repository.locationRecords).toHaveLength(0);
  });
});
