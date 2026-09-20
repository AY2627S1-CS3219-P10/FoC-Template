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
import type { CreateSupplierInput } from '../../../src/application/use-cases/create-supplier.use-case.js';
import { CreateSupplierUseCase } from '../../../src/application/use-cases/create-supplier.use-case.js';
import type { SupplierCatalogEntry } from '../../../src/domain/supplier-catalog.js';
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
const CREATED: SupplierCatalogEntry = {
  category: 'FOOD_COFFEE',
  id: '30000000-0000-4000-8000-000000000001',
  locations: [
    {
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
    },
  ],
  name: 'Starbucks',
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

describe('AdminSuppliersController', () => {
  let app: NestFastifyApplication;
  let createSupplier: StubCreateSupplierUseCase;
  let jwtService: JwtService;

  beforeEach(async () => {
    createSupplier = new StubCreateSupplierUseCase();
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
