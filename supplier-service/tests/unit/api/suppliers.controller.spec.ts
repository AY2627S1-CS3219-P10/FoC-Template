import {
  Controller,
  Get,
  type INestApplication,
  UseGuards,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';

import { SuppliersController } from '../../../src/api/http/suppliers.controller.js';
import { ListCampusLocationsUseCase } from '../../../src/application/use-cases/list-campus-locations.use-case.js';
import { ListSuppliersUseCase } from '../../../src/application/use-cases/list-suppliers.use-case.js';
import type {
  CampusLocationCatalogEntry,
  SupplierCatalogEntry,
} from '../../../src/domain/supplier-catalog.js';
import { AuthModule } from '../../../src/platform/auth/auth.module.js';
import { JwtAuthenticationGuard } from '../../../src/platform/auth/jwt-authentication.guard.js';
import { RequireRoles } from '../../../src/platform/auth/require-roles.decorator.js';
import { RolesGuard } from '../../../src/platform/auth/roles.guard.js';
import { UserRole } from '../../../src/platform/auth/user-role.js';
import { validateEnvironment } from '../../../src/platform/config/environment.schema.js';
import { configureHttpApplication } from '../../../src/platform/http/configure-http-application.js';

const JWT_ACCESS_TOKEN_SECRET =
  'test-access-token-secret-at-least-32-characters';
const JWT_ISSUER = 'foc-user-service';
const JWT_AUDIENCE = 'foc-api';
const CATALOG: SupplierCatalogEntry[] = [
  {
    category: 'FOOD_COFFEE',
    id: '10000000-0000-4000-8000-000000000006',
    locations: [
      {
        building: 'Central Library',
        closesAt: '23:59',
        floor: 1,
        id: '20000000-0000-4000-8000-000000000006',
        imageUrl: null,
        isOpenOvernight: false,
        latitude: 1.296444,
        locationDescription: 'Opp to central library entrance',
        longitude: 103.773032,
        opensAt: '00:00',
        supplierAtLocation: 'Cafe+ Robot Cafe@Central Library',
      },
    ],
    name: 'Cafe+ Robot Cafe',
  },
];
const CAMPUS_LOCATIONS: CampusLocationCatalogEntry[] = [
  {
    building: 'Central Library',
    id: '20000000-0000-4000-8000-000000000006',
    latitude: 1.296444,
    longitude: 103.773032,
  },
];

class StubListCampusLocationsUseCase {
  calls = 0;

  execute(): Promise<CampusLocationCatalogEntry[]> {
    this.calls += 1;
    return Promise.resolve(CAMPUS_LOCATIONS);
  }
}

class StubListSuppliersUseCase {
  calls = 0;

  execute(): Promise<SupplierCatalogEntry[]> {
    this.calls += 1;
    return Promise.resolve(CATALOG);
  }
}

@Controller('admin-probe')
@UseGuards(JwtAuthenticationGuard, RolesGuard)
class AdminProbeController {
  @Get()
  @RequireRoles(UserRole.Admin)
  get(): { allowed: true } {
    return { allowed: true };
  }
}

describe('SuppliersController authentication and RBAC', () => {
  let app: NestFastifyApplication;
  let jwtService: JwtService;
  let listCampusLocations: StubListCampusLocationsUseCase;
  let listSuppliers: StubListSuppliersUseCase;

  beforeEach(async () => {
    listCampusLocations = new StubListCampusLocationsUseCase();
    listSuppliers = new StubListSuppliersUseCase();
    const moduleRef = await Test.createTestingModule({
      controllers: [SuppliersController, AdminProbeController],
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
          provide: ListCampusLocationsUseCase,
          useValue: listCampusLocations,
        },
        {
          provide: ListSuppliersUseCase,
          useValue: listSuppliers,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    configureHttpApplication(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    jwtService = new JwtService({ secret: JWT_ACCESS_TOKEN_SECRET });
  });

  afterEach(async () => {
    if (app) {
      await (app as INestApplication).close();
    }
  });

  it.each([false, true])(
    'allows an authenticated user with isAdmin=%s to read suppliers',
    async (isAdmin) => {
      const response = await app.inject({
        headers: { authorization: `Bearer ${createToken(isAdmin)}` },
        method: 'GET',
        url: '/api/suppliers',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(CATALOG);
      expect(listSuppliers.calls).toBe(1);
    },
  );

  it('returns fixed NUS campus locations without a request body', async () => {
    const response = await app.inject({
      headers: { authorization: `Bearer ${createToken(true)}` },
      method: 'GET',
      url: '/api/suppliers/campus-locations',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(CAMPUS_LOCATIONS);
    expect(listCampusLocations.calls).toBe(1);
  });

  it('rejects an unauthenticated supplier-list request', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/suppliers',
    });

    expect(response.statusCode).toBe(401);
    expect(listSuppliers.calls).toBe(0);
  });

  it('rejects an expired access token', async () => {
    const response = await app.inject({
      headers: { authorization: `Bearer ${createToken(false, -1)}` },
      method: 'GET',
      url: '/api/suppliers',
    });

    expect(response.statusCode).toBe(401);
    expect(listSuppliers.calls).toBe(0);
  });

  it('returns 403 when a student accesses an admin-only operation', async () => {
    const response = await app.inject({
      headers: { authorization: `Bearer ${createToken(false)}` },
      method: 'GET',
      url: '/api/admin-probe',
    });

    expect(response.statusCode).toBe(403);
  });

  it('allows an administrator to access an admin-only operation', async () => {
    const response = await app.inject({
      headers: { authorization: `Bearer ${createToken(true)}` },
      method: 'GET',
      url: '/api/admin-probe',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ allowed: true });
  });

  function createToken(isAdmin: boolean, expiresIn = 900): string {
    return jwtService.sign(
      {
        isAdmin,
        sid: 'e414b596-4ba2-4c43-841b-0fa699164faa',
      },
      {
        algorithm: 'HS256',
        audience: JWT_AUDIENCE,
        expiresIn,
        issuer: JWT_ISSUER,
        subject: '4a84f480-b1cb-4b81-b632-8bb49034b9e7',
      },
    );
  }
});
