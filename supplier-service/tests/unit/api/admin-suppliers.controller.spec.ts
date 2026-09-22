import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';

import { AdminSuppliersController } from '../../../src/api/http/admin-suppliers.controller.js';
import { SupplierAlreadyExistsError } from '../../../src/application/errors/supplier-already-exists.error.js';
import { SupplierLocationNotFoundError } from '../../../src/application/errors/supplier-location-not-found.error.js';
import { SupplierNotFoundError } from '../../../src/application/errors/supplier-not-found.error.js';
import type { CreateSupplierInput } from '../../../src/application/use-cases/create-supplier.use-case.js';
import { CreateSupplierUseCase } from '../../../src/application/use-cases/create-supplier.use-case.js';
import { DeactivateSupplierUseCase } from '../../../src/application/use-cases/deactivate-supplier.use-case.js';
import type { UpdateSupplierLocationInput } from '../../../src/application/use-cases/update-supplier-location.use-case.js';
import { UpdateSupplierLocationUseCase } from '../../../src/application/use-cases/update-supplier-location.use-case.js';
import type { UpdateSupplierInput } from '../../../src/application/use-cases/update-supplier.use-case.js';
import { UpdateSupplierUseCase } from '../../../src/application/use-cases/update-supplier.use-case.js';
import type {
  SupplierCatalogEntry,
  SupplierLocationCatalogEntry,
} from '../../../src/domain/supplier-catalog.js';
import { SupplierValidationError } from '../../../src/domain/supplier-validation.error.js';
import { AuthModule } from '../../../src/platform/auth/auth.module.js';
import { validateEnvironment } from '../../../src/platform/config/environment.schema.js';
import { configureHttpApplication } from '../../../src/platform/http/configure-http-application.js';

const JWT_SECRET = 'test-access-token-secret-at-least-32-characters';
const JWT_ISSUER = 'foc-user-service';
const JWT_AUDIENCE = 'foc-supplier-service';
const REQUEST: CreateSupplierInput = {
  category: 'FOOD_COFFEE',
  location: {
    building: 'UTown',
    closesAt: '20:00',
    floor: 1,
    imageUrl: 'https://example.com/starbucks-utown.jpg',
    latitude: 1.3048,
    locationDescription: 'Near the main entrance',
    longitude: 103.7739,
    opensAt: '08:00',
  },
  name: 'Starbucks',
};
const ORIGINAL_LOCATION: SupplierLocationCatalogEntry = {
  building: 'UTown',
  closesAt: '20:00',
  floor: 1,
  id: '40000000-0000-4000-8000-000000000001',
  imageUrl: 'https://example.com/starbucks-utown.jpg',
  isOpenOvernight: false,
  latitude: 1.3048,
  locationDescription: 'Near the main entrance',
  longitude: 103.7739,
  opensAt: '08:00',
  supplierAtLocation: 'Starbucks@UTown',
};
const CREATED: SupplierCatalogEntry = {
  category: 'FOOD_COFFEE',
  id: '30000000-0000-4000-8000-000000000001',
  locations: [ORIGINAL_LOCATION],
  name: 'Starbucks',
};
const UPDATED_LOCATION: SupplierLocationCatalogEntry = {
  ...ORIGINAL_LOCATION,
  building: 'Science',
  floor: 2,
  latitude: 1.2966,
  locationDescription: 'Beside the main entrance',
  longitude: 103.7801,
  supplierAtLocation: 'Starbucks@Science',
};

class StubCreateSupplierUseCase {
  readonly inputs: CreateSupplierInput[] = [];
  error?: Error;

  execute(input: CreateSupplierInput): Promise<SupplierCatalogEntry> {
    this.inputs.push(input);

    if (this.error) {
      return Promise.reject(this.error);
    }

    return Promise.resolve(CREATED);
  }
}

class StubUpdateSupplierUseCase {
  readonly inputs: Array<{
    input: UpdateSupplierInput;
    supplierId: string;
  }> = [];
  error?: Error;

  execute(
    supplierId: string,
    input: UpdateSupplierInput,
  ): Promise<SupplierCatalogEntry> {
    this.inputs.push({ input, supplierId });

    if (this.error) {
      return Promise.reject(this.error);
    }

    return Promise.resolve({
      ...CREATED,
      name: input.name ?? CREATED.name,
    });
  }
}

class StubDeactivateSupplierUseCase {
  readonly supplierIds: string[] = [];
  error?: Error;

  execute(supplierId: string): Promise<void> {
    this.supplierIds.push(supplierId);

    if (this.error) {
      return Promise.reject(this.error);
    }

    return Promise.resolve();
  }
}

class StubUpdateSupplierLocationUseCase {
  readonly inputs: Array<{
    input: UpdateSupplierLocationInput;
    locationId: string;
    supplierId: string;
  }> = [];
  error?: Error;

  execute(
    supplierId: string,
    locationId: string,
    input: UpdateSupplierLocationInput,
  ): Promise<SupplierLocationCatalogEntry> {
    this.inputs.push({ input, locationId, supplierId });

    if (this.error) {
      return Promise.reject(this.error);
    }

    return Promise.resolve(UPDATED_LOCATION);
  }
}

describe('AdminSuppliersController', () => {
  let app: NestFastifyApplication;
  let createSupplier: StubCreateSupplierUseCase;
  let deactivateSupplier: StubDeactivateSupplierUseCase;
  let updateSupplierLocation: StubUpdateSupplierLocationUseCase;
  let updateSupplier: StubUpdateSupplierUseCase;
  let jwtService: JwtService;

  beforeEach(async () => {
    createSupplier = new StubCreateSupplierUseCase();
    deactivateSupplier = new StubDeactivateSupplierUseCase();
    updateSupplierLocation = new StubUpdateSupplierLocationUseCase();
    updateSupplier = new StubUpdateSupplierUseCase();
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminSuppliersController],
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          isGlobal: true,
          validate: validateEnvironment,
        }),
        AuthModule,
      ],
      providers: [
        {
          provide: CreateSupplierUseCase,
          useValue: createSupplier,
        },
        {
          provide: DeactivateSupplierUseCase,
          useValue: deactivateSupplier,
        },
        {
          provide: UpdateSupplierUseCase,
          useValue: updateSupplier,
        },
        {
          provide: UpdateSupplierLocationUseCase,
          useValue: updateSupplierLocation,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    configureHttpApplication(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    jwtService = new JwtService({ secret: JWT_SECRET });
  });

  afterEach(async () => {
    if (app) {
      await (app as INestApplication).close();
    }
  });

  it('allows an administrator to create a supplier', async () => {
    const response = await app.inject({
      headers: { authorization: `Bearer ${createToken(true)}` },
      method: 'POST',
      payload: REQUEST,
      url: '/api/admin/suppliers',
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual(CREATED);
    expect(createSupplier.inputs).toEqual([REQUEST]);
  });

  it('returns 403 when a student tries to create a supplier', async () => {
    const response = await app.inject({
      headers: { authorization: `Bearer ${createToken(false)}` },
      method: 'POST',
      payload: REQUEST,
      url: '/api/admin/suppliers',
    });

    expect(response.statusCode).toBe(403);
    expect(createSupplier.inputs).toHaveLength(0);
  });

  it('returns 401 when no access token is supplied', async () => {
    const response = await app.inject({
      method: 'POST',
      payload: REQUEST,
      url: '/api/admin/suppliers',
    });

    expect(response.statusCode).toBe(401);
    expect(createSupplier.inputs).toHaveLength(0);
  });

  it('rejects invalid supplier details before invoking the use case', async () => {
    const response = await app.inject({
      headers: { authorization: `Bearer ${createToken(true)}` },
      method: 'POST',
      payload: { ...REQUEST, name: '' },
      url: '/api/admin/suppliers',
    });

    expect(response.statusCode).toBe(400);
    expect(createSupplier.inputs).toHaveLength(0);
  });

  it('maps a duplicate supplier to HTTP 409', async () => {
    createSupplier.error = new SupplierAlreadyExistsError('name');

    const response = await app.inject({
      headers: { authorization: `Bearer ${createToken(true)}` },
      method: 'POST',
      payload: REQUEST,
      url: '/api/admin/suppliers',
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: 'SUPPLIER_ALREADY_EXISTS',
      field: 'name',
    });
  });

  it('allows an administrator to deactivate a supplier', async () => {
    const response = await app.inject({
      headers: { authorization: `Bearer ${createToken(true)}` },
      method: 'DELETE',
      url: `/api/admin/suppliers/${CREATED.id}`,
    });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expect(deactivateSupplier.supplierIds).toEqual([CREATED.id]);
  });

  it('returns 403 when a student tries to deactivate a supplier', async () => {
    const response = await app.inject({
      headers: { authorization: `Bearer ${createToken(false)}` },
      method: 'DELETE',
      url: `/api/admin/suppliers/${CREATED.id}`,
    });

    expect(response.statusCode).toBe(403);
    expect(deactivateSupplier.supplierIds).toHaveLength(0);
  });

  it('rejects an invalid supplier id before invoking the deactivate use case', async () => {
    const response = await app.inject({
      headers: { authorization: `Bearer ${createToken(true)}` },
      method: 'DELETE',
      url: '/api/admin/suppliers/not-a-uuid',
    });

    expect(response.statusCode).toBe(400);
    expect(deactivateSupplier.supplierIds).toHaveLength(0);
  });

  it('maps an unknown supplier deletion to HTTP 404', async () => {
    deactivateSupplier.error = new SupplierNotFoundError(CREATED.id);

    const response = await app.inject({
      headers: { authorization: `Bearer ${createToken(true)}` },
      method: 'DELETE',
      url: `/api/admin/suppliers/${CREATED.id}`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      code: 'SUPPLIER_NOT_FOUND',
      field: 'supplierId',
    });
  });

  it('allows an administrator to update a supplier', async () => {
    const supplierId = CREATED.id;
    const update = { name: 'Starbucks Coffee' };

    const response = await app.inject({
      headers: { authorization: `Bearer ${createToken(true)}` },
      method: 'PATCH',
      payload: update,
      url: `/api/admin/suppliers/${supplierId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ name: 'Starbucks Coffee' });
    expect(updateSupplier.inputs).toEqual([{ input: update, supplierId }]);
  });

  it('returns 403 when a student tries to update a supplier', async () => {
    const response = await app.inject({
      headers: { authorization: `Bearer ${createToken(false)}` },
      method: 'PATCH',
      payload: { category: 'SHOPPING' },
      url: `/api/admin/suppliers/${CREATED.id}`,
    });

    expect(response.statusCode).toBe(403);
    expect(updateSupplier.inputs).toHaveLength(0);
  });

  it('rejects an invalid supplier id before invoking the update use case', async () => {
    const response = await app.inject({
      headers: { authorization: `Bearer ${createToken(true)}` },
      method: 'PATCH',
      payload: { name: 'Starbucks Coffee' },
      url: '/api/admin/suppliers/not-a-uuid',
    });

    expect(response.statusCode).toBe(400);
    expect(updateSupplier.inputs).toHaveLength(0);
  });

  it('maps an empty supplier update to HTTP 400', async () => {
    updateSupplier.error = new SupplierValidationError(
      'supplier',
      'SUPPLIER_UPDATE_EMPTY',
      'At least one supplier field must be provided.',
    );

    const response = await app.inject({
      headers: { authorization: `Bearer ${createToken(true)}` },
      method: 'PATCH',
      payload: {},
      url: `/api/admin/suppliers/${CREATED.id}`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'SUPPLIER_UPDATE_EMPTY' });
  });

  it('maps an unknown supplier to HTTP 404', async () => {
    updateSupplier.error = new SupplierNotFoundError(CREATED.id);

    const response = await app.inject({
      headers: { authorization: `Bearer ${createToken(true)}` },
      method: 'PATCH',
      payload: { name: 'Starbucks Coffee' },
      url: `/api/admin/suppliers/${CREATED.id}`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      code: 'SUPPLIER_NOT_FOUND',
      field: 'supplierId',
    });
  });

  it('maps an update name conflict to HTTP 409', async () => {
    updateSupplier.error = new SupplierAlreadyExistsError('name');

    const response = await app.inject({
      headers: { authorization: `Bearer ${createToken(true)}` },
      method: 'PATCH',
      payload: { name: 'Deck Cafe' },
      url: `/api/admin/suppliers/${CREATED.id}`,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: 'SUPPLIER_ALREADY_EXISTS',
      field: 'name',
    });
  });

  it('allows an administrator to replace location details', async () => {
    const locationId = ORIGINAL_LOCATION.id;
    const update = {
      building: 'Science',
      floor: 2,
      latitude: 1.2966,
      locationDescription: 'Beside the main entrance',
      longitude: 103.7801,
    };

    const response = await app.inject({
      headers: { authorization: `Bearer ${createToken(true)}` },
      method: 'PATCH',
      payload: update,
      url: `/api/admin/suppliers/${CREATED.id}/locations/${locationId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(UPDATED_LOCATION);
    expect(updateSupplierLocation.inputs).toEqual([
      { input: update, locationId, supplierId: CREATED.id },
    ]);
  });

  it('returns 403 when a student tries to update location details', async () => {
    const response = await app.inject({
      headers: { authorization: `Bearer ${createToken(false)}` },
      method: 'PATCH',
      payload: { building: 'Science' },
      url: `/api/admin/suppliers/${CREATED.id}/locations/${ORIGINAL_LOCATION.id}`,
    });

    expect(response.statusCode).toBe(403);
    expect(updateSupplierLocation.inputs).toHaveLength(0);
  });

  it('rejects an invalid location id before invoking the location use case', async () => {
    const response = await app.inject({
      headers: { authorization: `Bearer ${createToken(true)}` },
      method: 'PATCH',
      payload: { building: 'Science' },
      url: `/api/admin/suppliers/${CREATED.id}/locations/not-a-uuid`,
    });

    expect(response.statusCode).toBe(400);
    expect(updateSupplierLocation.inputs).toHaveLength(0);
  });

  it('maps an empty location update to HTTP 400', async () => {
    updateSupplierLocation.error = new SupplierValidationError(
      'location',
      'SUPPLIER_LOCATION_UPDATE_EMPTY',
      'At least one supplier location field must be provided.',
    );

    const response = await app.inject({
      headers: { authorization: `Bearer ${createToken(true)}` },
      method: 'PATCH',
      payload: {},
      url: `/api/admin/suppliers/${CREATED.id}/locations/${ORIGINAL_LOCATION.id}`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: 'SUPPLIER_LOCATION_UPDATE_EMPTY',
    });
  });

  it('maps an unknown supplier location to HTTP 404', async () => {
    const locationId = ORIGINAL_LOCATION.id;
    updateSupplierLocation.error = new SupplierLocationNotFoundError(
      CREATED.id,
      locationId,
    );

    const response = await app.inject({
      headers: { authorization: `Bearer ${createToken(true)}` },
      method: 'PATCH',
      payload: { building: 'Science' },
      url: `/api/admin/suppliers/${CREATED.id}/locations/${locationId}`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      code: 'SUPPLIER_LOCATION_NOT_FOUND',
      field: 'locationId',
    });
  });

  it('maps a duplicate updated location to HTTP 409', async () => {
    updateSupplierLocation.error = new SupplierAlreadyExistsError(
      'supplierAtLocation',
    );

    const response = await app.inject({
      headers: { authorization: `Bearer ${createToken(true)}` },
      method: 'PATCH',
      payload: { building: 'Science' },
      url: `/api/admin/suppliers/${CREATED.id}/locations/${ORIGINAL_LOCATION.id}`,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: 'SUPPLIER_ALREADY_EXISTS',
      field: 'supplierAtLocation',
    });
  });

  function createToken(isAdmin: boolean): string {
    return jwtService.sign(
      {
        isAdmin,
        sessionId: 'e414b596-4ba2-4c43-841b-0fa699164faa',
        userId: '4a84f480-b1cb-4b81-b632-8bb49034b9e7',
      },
      {
        algorithm: 'HS256',
        audience: JWT_AUDIENCE,
        expiresIn: 900,
        issuer: JWT_ISSUER,
      },
    );
  }
});
