import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import creditConfiguration from '../../../credit-service/src/infrastructure/configuration';
import { ValidationPipe } from '@nestjs/common';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { AppModule } from '../../src/app.module';
import { HttpFilter } from '../../src/api/http.filter';
import { PrismaService } from '../../src/infrastructure/prisma.service';
import { RecoveryWorker } from '../../src/infrastructure/recovery.worker';
import { OrderService } from '../../src/application/order.service';
import { AppModule as CreditModule } from '../../../credit-service/src/app.module';
import { PrismaService as CreditPrisma } from '../../../credit-service/src/infrastructure/prisma.service';
import { HttpExceptionFilter as CreditFilter } from '../../../credit-service/src/api/http-exception.filter';

const requesterId = '10000000-0000-4000-8000-000000000001';
const otherId = '10000000-0000-4000-8000-000000000002';
const pickupId = '20000000-0000-4000-8000-000000000001';
const input = {
  pickupLocationId: pickupId,
  description: 'Pick up coffee',
  deliveryDestination: 'Library entrance',
  instructions: 'Call on arrival',
  offeredCredits: 20,
};
async function listen(server: Server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing address');
  return `http://127.0.0.1:${address.port}`;
}
async function migrate(url: string, folder: string) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    for (const name of readdirSync(folder).sort()) {
      const migration = resolve(folder, name, 'migration.sql');
      if (
        name !== 'migration_lock.toml' &&
        !name.startsWith('.') &&
        existsSync(migration)
      )
        await client.query(readFileSync(migration, 'utf8'));
    }
  } finally {
    await client.end();
  }
}
describe('FR4 with real independent Order/Credit PostgreSQL databases and HTTP credit calls', () => {
  let orderDb: StartedPostgreSqlContainer;
  let creditDb: StartedPostgreSqlContainer;
  let app: NestFastifyApplication;
  let creditApp: NestFastifyApplication;
  let prisma: PrismaService;
  let creditPrisma: CreditPrisma;
  let service: OrderService;
  let lookup: Server;
  let proxy: Server;
  let available = true;
  let accountActive = true;
  let outage = false;
  let loseAck: 'reserve' | 'adjust' | 'release' | null = null;
  beforeAll(async () => {
    [orderDb, creditDb] = await Promise.all([
      new PostgreSqlContainer('postgres:17-alpine').start(),
      new PostgreSqlContainer('postgres:17-alpine').start(),
    ]);
    await migrate(orderDb.getConnectionUri(), resolve('migrations'));
    await migrate(
      creditDb.getConnectionUri(),
      resolve('../credit-service/migrations'),
    );
    process.env.DATABASE_URL = creditDb.getConnectionUri();
    process.env.CREDIT_INITIAL_BALANCE = '100';
    const creditModule = await Test.createTestingModule({
      imports: [CreditModule],
    })
      .overrideProvider(ConfigService)
      .useValue(
        new ConfigService({
          DATABASE_URL: creditDb.getConnectionUri(),
          ...creditConfiguration(),
        }),
      )
      .compile();
    creditApp = creditModule.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    creditApp.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    creditApp.useGlobalFilters(new CreditFilter());
    await creditApp.init();
    await creditApp.listen(0, '127.0.0.1');
    creditPrisma = creditApp.get(CreditPrisma);
    const creditAddress = creditApp
      .getHttpAdapter()
      .getInstance()
      .server.address();
    if (!creditAddress || typeof creditAddress === 'string')
      throw new Error('Missing credit address');
    const creditOrigin = `http://127.0.0.1:${creditAddress.port}`;
    proxy = createServer(async (req, res) => {
      if (outage) {
        res
          .writeHead(503, { 'Content-Type': 'application/json' })
          .end('{"code":"SERVICE_UNAVAILABLE"}');
        return;
      }
      let body = '';
      for await (const chunk of req) body += chunk;
      const upstream = await fetch(`${creditOrigin}${req.url}`, {
        method: req.method,
        headers: {
          authorization: String(req.headers.authorization || ''),
          'Content-Type': 'application/json',
        },
        body: body || undefined,
      });
      if (
        upstream.ok &&
        ((loseAck === 'reserve' && req.url === '/v1/credit-reservations') ||
          (loseAck === 'adjust' && req.url?.endsWith('/adjustment')) ||
          (loseAck === 'release' && req.url?.endsWith('/release')))
      ) {
        loseAck = null;
        res.destroy();
        return;
      }
      res
        .writeHead(upstream.status, { 'Content-Type': 'application/json' })
        .end(await upstream.text());
    });
    process.env.CREDIT_SERVICE_URL = await listen(proxy);
    lookup = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url?.match(/^\/api\/accounts\/[^/]+\/identity$/)) {
        res.end(JSON.stringify({ id: requesterId, username: 'RequesterName' }));
        return;
      }
      if (req.url === '/api/accounts/me') {
        if (
          !accountActive ||
          !['Bearer requester', 'Bearer other', 'Bearer admin'].includes(
            String(req.headers.authorization),
          )
        ) {
          res.writeHead(401).end('{}');
          return;
        }
        res.end(
          JSON.stringify({
            id:
              req.headers.authorization === 'Bearer requester'
                ? requesterId
                : otherId,
            status: 'ACTIVE',
            isAdmin: req.headers.authorization === 'Bearer admin',
            emailVerifiedAt: new Date().toISOString(),
          }),
        );
        return;
      }
      res.end(
        JSON.stringify(
          available
            ? [
                {
                  name: 'Campus Cafe',
                  locations: [
                    {
                      id: pickupId,
                      building: 'Central Library',
                      floor: 1,
                      supplierAtLocation: 'Cafe@Com2',
                    },
                  ],
                },
              ]
            : [],
        ),
      );
    });
    process.env.USER_SERVICE_URL = process.env.SUPPLIER_SERVICE_URL =
      await listen(lookup);
    process.env.DATABASE_URL = orderDb.getConnectionUri();
    process.env.REDIS_URL = 'redis://127.0.0.1:6380';
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue(
        new ConfigService({
          DATABASE_URL: orderDb.getConnectionUri(),
          REDIS_URL: 'redis://127.0.0.1:6380',
          USER_SERVICE_URL: process.env.USER_SERVICE_URL,
          SUPPLIER_SERVICE_URL: process.env.SUPPLIER_SERVICE_URL,
          CREDIT_SERVICE_URL: process.env.CREDIT_SERVICE_URL,
          CREDIT_ORDER_SERVICE_TOKEN: process.env.CREDIT_ORDER_SERVICE_TOKEN,
        }),
      )
      .overrideProvider(RecoveryWorker)
      .useValue({})
      .compile();
    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(new HttpFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
    service = app.get(OrderService);
  });
  afterAll(async () => {
    await app?.close();
    if (proxy?.listening)
      await new Promise<void>((done) => proxy.close(() => done()));
    if (lookup?.listening)
      await new Promise<void>((done) => lookup.close(() => done()));
    await creditApp?.close();
    await orderDb?.stop();
    await creditDb?.stop();
  });
  beforeEach(async () => {
    available = true;
    accountActive = true;
    outage = false;
    loseAck = null;
    await prisma.$executeRawUnsafe(
      'TRUNCATE errands, errand_operations CASCADE',
    );
    await creditPrisma.$executeRawUnsafe('TRUNCATE credit_accounts CASCADE');
    for (const userId of [requesterId, otherId]) {
      const response = await creditApp.inject({
        method: 'POST',
        url: '/v1/credit-accounts',
        headers: {
          authorization: `Bearer ${process.env.CREDIT_USER_SERVICE_TOKEN}`,
        },
        payload: { userId },
      });
      expect(response.statusCode).toBe(201);
    }
  });
  const auth = { authorization: 'Bearer requester' };
  const create = (
    payload: object = input,
    key = randomUUID(),
    token = 'requester',
  ) =>
    app.inject({
      method: 'POST',
      url: '/api/errands',
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': key },
      payload,
    });
  const edit = (
    id: string,
    payload: object,
    key = randomUUID(),
    token = 'requester',
  ) =>
    app.inject({
      method: 'PATCH',
      url: `/api/errands/${id}`,
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': key },
      payload,
    });
  const remove = (id: string, token = 'requester', key = randomUUID()) =>
    app.inject({
      method: 'DELETE',
      url: `/api/errands/${id}`,
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': key },
    });
  it('owners delete requests, release credits exactly once and hide deleted records', async () => {
    const id = (await create()).json().errand.id;
    const key = randomUUID();
    expect((await remove(id, 'other')).statusCode).toBe(403);
    expect((await remove(id, 'requester', key)).statusCode).toBe(200);
    expect((await remove(id, 'requester', key)).statusCode).toBe(200);
    expect(await prisma.errand.findUnique({ where: { id } })).toMatchObject({
      deletedAt: expect.any(Date),
    });
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/errands/${id}`,
          headers: auth,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({ method: 'GET', url: '/api/errands', headers: auth })
      ).json(),
    ).toEqual([]);
    expect(
      await creditPrisma.creditAccount.findUnique({
        where: { userId: requesterId },
      }),
    ).toMatchObject({ availableCredits: 100, reservedCredits: 0 });
    expect(
      await creditPrisma.ledgerEntry.count({
        where: { type: 'RELEASE' },
      }),
    ).toBe(1);
  });
  it('admins can inspect/manage/delete all requests and edit only their own', async () => {
    const id = (await create()).json().errand.id;
    await prisma.errand.update({
      where: { id },
      data: { status: 'ACCEPTED', courierId: otherId },
    });
    expect((await remove(id)).statusCode).toBe(409);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/errands/${id}`,
          headers: { authorization: 'Bearer admin' },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/errands/manage',
          headers: { authorization: 'Bearer other' },
        })
      ).json(),
    ).toEqual([]);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/errands/manage',
          headers: { authorization: 'Bearer admin' },
        })
      ).json(),
    ).toHaveLength(1);
    expect(
      (
        await edit(
          id,
          { expectedVersion: 0, description: 'Admin changed it' },
          randomUUID(),
          'admin',
        )
      ).statusCode,
    ).toBe(403);
    const ownId = (await create(input, randomUUID(), 'admin')).json().errand.id;
    expect(
      (
        await edit(
          ownId,
          { expectedVersion: 0, description: 'Own admin errand' },
          randomUUID(),
          'admin',
        )
      ).statusCode,
    ).toBe(200);
    expect((await remove(id, 'admin')).statusCode).toBe(200);
  });
  it('lost release acknowledgement keeps deletion durable and retries without duplicate refunds', async () => {
    const id = (await create()).json().errand.id;
    loseAck = 'release';
    const response = await remove(id);
    expect(response.statusCode).toBe(202);
    expect(
      (await edit(id, { expectedVersion: 0, offeredCredits: 30 })).statusCode,
    ).toBe(409);
    expect((await service.process(response.json().operationId)).status).toBe(
      'SUCCEEDED',
    );
    expect(
      await creditPrisma.ledgerEntry.count({
        where: { type: 'RELEASE' },
      }),
    ).toBe(1);
    expect(
      await creditPrisma.creditAccount.findUnique({
        where: { userId: requesterId },
      }),
    ).toMatchObject({ availableCredits: 100, reservedCredits: 0 });
  });
  it('admin deletion preserves completed credit transfers', async () => {
    const id = (await create()).json().errand.id;
    // Exercise actual settlement through the Credit Service application.
    const { CreditService } =
      await import('../../../credit-service/src/application/credit.service');
    await creditApp.get(CreditService).settle({
      errandId: id,
      requesterId,
      courierId: otherId,
      amount: input.offeredCredits,
      correlationId: randomUUID(),
    });
    await prisma.errand.update({
      where: { id },
      data: { status: 'COMPLETED', courierId: otherId },
    });
    expect((await remove(id, 'admin')).statusCode).toBe(200);
    expect(
      await creditPrisma.creditAccount.findUnique({
        where: { userId: requesterId },
      }),
    ).toMatchObject({ availableCredits: 80, reservedCredits: 0 });
    expect(
      await creditPrisma.creditAccount.findUnique({
        where: { userId: otherId },
      }),
    ).toMatchObject({ availableCredits: 120, reservedCredits: 0 });
  });
  it('reserves credits before publishing a uniquely identified OPEN errand and lists it', async () => {
    const response = await create();
    expect(response.statusCode).toBe(201);
    const result = response.json<{
      errand: {
        id: string;
        requesterId: string;
        status: string;
        createdAt: string;
      };
    }>();
    expect(result.errand).toMatchObject({
      requesterId,
      status: 'OPEN',
      pickupLocationLabel: 'Cafe@Com2',
    });
    expect(result.errand.createdAt).toBeTruthy();
    expect(
      await creditPrisma.creditAccount.findUnique({
        where: { userId: requesterId },
      }),
    ).toMatchObject({ availableCredits: 80, reservedCredits: 20 });
    const listed = await app.inject({
      method: 'GET',
      url: '/api/errands',
      headers: auth,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toHaveLength(1);
  });
  it('sorts the whole catalogue before pagination by time or credits and rejects unknown options', async () => {
    const ids: string[] = [];
    for (const [index, offeredCredits] of [10, 30, 20].entries()) {
      const id = (await create({ ...input, offeredCredits })).json().errand.id;
      ids.push(id);
      await prisma.errand.update({
        where: { id },
        data: { createdAt: new Date(`2026-10-0${index + 1}T00:00:00Z`) },
      });
    }
    const expected = {
      newest: [ids[2], ids[1], ids[0]],
      oldest: ids,
      'credits-highest': [ids[1], ids[2], ids[0]],
      'credits-lowest': [ids[0], ids[2], ids[1]],
    };
    for (const [sort, order] of Object.entries(expected)) {
      for (const path of ['/api/errands', '/api/errands/manage']) {
        const response = await app.inject({
          method: 'GET',
          url: `${path}?sort=${sort}&limit=1&offset=1`,
          headers: auth,
        });
        expect(response.statusCode).toBe(200);
        expect(
          response.json().map((value: { id: string }) => value.id),
        ).toEqual([order[1]]);
      }
    }
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/errands?sort=invalid',
          headers: auth,
        })
      ).statusCode,
    ).toBe(400);
  });
  it.each([
    {},
    { ...input, description: ' ' },
    { ...input, instructions: null },
    { ...input, offeredCredits: 0 },
    { ...input, offeredCredits: 1.5 },
    { ...input, requesterId: otherId },
  ])(
    'rejects invalid mandatory fields or spoofed identity without an errand or credits',
    async (payload) => {
      expect((await create(payload)).statusCode).toBe(400);
      expect(await prisma.errand.count()).toBe(0);
      expect(await creditPrisma.creditReservation.count()).toBe(0);
    },
  );
  it('rejects missing idempotency keys, unavailable pickup locations and inactive sessions', async () => {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/errands',
          headers: auth,
          payload: input,
        })
      ).statusCode,
    ).toBe(400);
    available = false;
    expect((await create()).statusCode).toBe(400);
    accountActive = false;
    expect((await create()).statusCode).toBe(401);
    expect(await prisma.errand.count()).toBe(0);
  });
  it('rejects insufficient credits without an errand, and never overspends concurrently', async () => {
    expect((await create({ ...input, offeredCredits: 101 })).statusCode).toBe(
      422,
    );
    expect(await prisma.errand.count()).toBe(0);
    const responses = await Promise.all([
      create({ ...input, offeredCredits: 80 }),
      create({ ...input, offeredCredits: 80 }),
    ]);
    expect(responses.map((r) => r.statusCode).sort()).toEqual([201, 422]);
    expect(await prisma.errand.count()).toBe(1);
    expect(
      await creditPrisma.creditAccount.findUnique({
        where: { userId: requesterId },
      }),
    ).toMatchObject({ availableCredits: 20, reservedCredits: 80 });
  });
  it('replays identical creates without charging twice and rejects conflicting keys', async () => {
    const key = randomUUID();
    const [one, two] = await Promise.all([
      create(input, key),
      create(input, key),
    ]);
    expect(one.statusCode).toBe(201);
    expect(two.statusCode).toBe(201);
    expect(await prisma.errand.count()).toBe(1);
    expect(
      (await create({ ...input, description: 'Different' }, key)).statusCode,
    ).toBe(409);
    expect(
      await creditPrisma.ledgerEntry.count({
        where: { type: 'RESERVE' },
      }),
    ).toBe(1);
  });
  it('increases/decreases a bounty, releasing excess and reserving only the difference', async () => {
    const original = (await create()).json<{ errand: { id: string } }>().errand;
    expect(
      (
        await edit(original.id, {
          expectedVersion: 0,
          offeredCredits: 60,
          description: 'Edited',
        })
      ).statusCode,
    ).toBe(200);
    expect(
      await creditPrisma.creditAccount.findUnique({
        where: { userId: requesterId },
      }),
    ).toMatchObject({ availableCredits: 40, reservedCredits: 60 });
    expect(
      (
        await edit(original.id, {
          expectedVersion: 1,
          offeredCredits: 10,
          deliveryDestination: 'UTown',
          instructions: 'Meet downstairs',
        })
      ).statusCode,
    ).toBe(200);
    expect(
      await creditPrisma.creditAccount.findUnique({
        where: { userId: requesterId },
      }),
    ).toMatchObject({ availableCredits: 90, reservedCredits: 10 });
    expect(
      await prisma.errand.findUnique({ where: { id: original.id } }),
    ).toMatchObject({
      offeredCredits: 10,
      deliveryDestination: 'UTown',
      version: 2,
    });
  });
  it('failed increases leave both errand fields and balances unchanged', async () => {
    const id = (await create()).json<{ errand: { id: string } }>().errand.id;
    expect(
      (
        await edit(id, {
          expectedVersion: 0,
          offeredCredits: 101,
          description: 'Must not persist',
        })
      ).statusCode,
    ).toBe(422);
    expect(await prisma.errand.findUnique({ where: { id } })).toMatchObject({
      description: input.description,
      offeredCredits: 20,
      version: 0,
      pendingOperationId: null,
    });
    expect(
      await creditPrisma.creditAccount.findUnique({
        where: { userId: requesterId },
      }),
    ).toMatchObject({ availableCredits: 80, reservedCredits: 20 });
  });
  it('rejects non-owner, stale, empty, pickup-changing and accepted edits', async () => {
    const id = (await create()).json<{ errand: { id: string } }>().errand.id;
    expect(
      (
        await edit(
          id,
          { expectedVersion: 0, description: 'Other' },
          randomUUID(),
          'other',
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (await edit(id, { expectedVersion: 1, description: 'Stale' })).statusCode,
    ).toBe(409);
    expect((await edit(id, { expectedVersion: 0 })).statusCode).toBe(400);
    expect(
      (await edit(id, { expectedVersion: 0, pickupLocationId: randomUUID() }))
        .statusCode,
    ).toBe(400);
    await prisma.errand.update({
      where: { id },
      data: { status: 'ACCEPTED', courierId: otherId },
    });
    expect(
      (await edit(id, { expectedVersion: 0, description: 'Too late' }))
        .statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({ method: 'GET', url: '/api/errands', headers: auth })
      ).json(),
    ).toEqual([]);
  });
  it('recovers a lost reservation acknowledgement without duplicate charges or partial publication', async () => {
    loseAck = 'reserve';
    const response = await create();
    expect(response.statusCode).toBe(202);
    const operationId = response.json<{ operationId: string }>().operationId;
    expect(await prisma.errand.count()).toBe(0);
    expect(await creditPrisma.creditReservation.count()).toBe(1);
    expect((await service.process(operationId)).status).toBe('SUCCEEDED');
    expect(await prisma.errand.count()).toBe(1);
    expect(
      await creditPrisma.ledgerEntry.count({
        where: { type: 'RESERVE' },
      }),
    ).toBe(1);
  });
  it('retries after a real Order DB commit failure without reserving twice', async () => {
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION fail_publication() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulate crash after credits'; END $$`,
    );
    await prisma.$executeRawUnsafe(
      'CREATE TRIGGER fail_publication BEFORE INSERT ON errands FOR EACH ROW EXECUTE FUNCTION fail_publication()',
    );
    const response = await create();
    expect(response.statusCode).toBe(202);
    expect(await prisma.errand.count()).toBe(0);
    await prisma.$executeRawUnsafe('DROP TRIGGER fail_publication ON errands');
    await prisma.$executeRawUnsafe('DROP FUNCTION fail_publication()');
    await service.process(response.json<{ operationId: string }>().operationId);
    expect(await prisma.errand.count()).toBe(1);
    expect(
      await creditPrisma.ledgerEntry.count({
        where: { type: 'RESERVE' },
      }),
    ).toBe(1);
  });
  it('keeps a lost edit acknowledgement locked and hidden until idempotent recovery completes', async () => {
    const id = (await create()).json<{ errand: { id: string } }>().errand.id;
    loseAck = 'adjust';
    const response = await edit(id, { expectedVersion: 0, offeredCredits: 30 });
    expect(response.statusCode).toBe(202);
    expect(
      (
        await app.inject({ method: 'GET', url: '/api/errands', headers: auth })
      ).json(),
    ).toEqual([]);
    expect(
      (await edit(id, { expectedVersion: 0, offeredCredits: 25 })).statusCode,
    ).toBe(409);
    await service.process(response.json<{ operationId: string }>().operationId);
    expect(await prisma.errand.findUnique({ where: { id } })).toMatchObject({
      offeredCredits: 30,
      version: 1,
      pendingOperationId: null,
    });
    expect(
      await creditPrisma.creditAccount.findUnique({
        where: { userId: requesterId },
      }),
    ).toMatchObject({ availableCredits: 70, reservedCredits: 30 });
    expect(await creditPrisma.creditReservationAdjustment.count()).toBe(1);
  });
  it('journals outages durably and exposes operation status only to the requester', async () => {
    outage = true;
    const response = await create();
    expect(response.statusCode).toBe(202);
    const id = response.json<{ operationId: string }>().operationId;
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/errand-operations/${id}`,
          headers: { authorization: 'Bearer other' },
        })
      ).statusCode,
    ).toBe(404);
    outage = false;
    await service.process(id);
    expect(await prisma.errand.count()).toBe(1);
  });
});
