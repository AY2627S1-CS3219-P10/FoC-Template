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
import { OutboxRelay } from '../../src/infrastructure/outbox.relay';
import { TimerWorker } from '../../src/infrastructure/timer.worker';
import type { ChannelModel } from 'amqplib';
import { OrderService } from '../../src/application/order.service';
import {
  ORDER_REPOSITORY,
  type OrderRepository,
} from '../../src/application/ports';
import { AppModule as CreditModule } from '../../../credit-service/src/app.module';
import { PrismaService as CreditPrisma } from '../../../credit-service/src/infrastructure/prisma.service';
import { HttpExceptionFilter as CreditFilter } from '../../../credit-service/src/api/http-exception.filter';
import { CreditEventsHandler } from '../../../credit-service/src/api/credit-events.handler';

const requesterId = '10000000-0000-4000-8000-000000000001';
const otherId = '10000000-0000-4000-8000-000000000002';
const pickupId = '20000000-0000-4000-8000-000000000001';
const courierId = '10000000-0000-4000-8000-000000000003';
/** Fake user-service sessions: `Bearer courier-7` is a distinct courier per number. */
function userFor(authorization: unknown) {
  const numbered = String(authorization).match(/^Bearer courier-(\d{1,4})$/);
  if (numbered)
    return `30000000-0000-4000-8000-${numbered[1].padStart(12, '0')}`;
  return {
    'Bearer requester': requesterId,
    'Bearer other': otherId,
    'Bearer admin': otherId,
    'Bearer courier': courierId,
  }[String(authorization)];
}
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
          ...(req.headers['x-correlation-id']
            ? { 'x-correlation-id': String(req.headers['x-correlation-id']) }
            : {}),
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
        const id = userFor(req.headers.authorization);
        if (!accountActive || !id) {
          res.writeHead(401).end('{}');
          return;
        }
        res.end(
          JSON.stringify({
            id,
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
      .overrideProvider(TimerWorker)
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
      'TRUNCATE errands, errand_operations, outbox_events CASCADE',
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
  const accept = (id: string, token = 'courier') =>
    app.inject({
      method: 'POST',
      url: `/api/errands/${id}/accept`,
      headers: { authorization: `Bearer ${token}` },
    });
  const read = (id: string, token: string) =>
    app.inject({
      method: 'GET',
      url: `/api/errands/${id}`,
      headers: { authorization: `Bearer ${token}` },
    });
  const balances = () =>
    creditPrisma.creditAccount.findMany({
      orderBy: { userId: 'asc' },
      select: { userId: true, availableCredits: true, reservedCredits: true },
    });
  it('S4: a courier accepts an OPEN errand; both parties see it, strangers and the open list do not', async () => {
    const id = (await create()).json().errand.id;
    const response = await accept(id);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id,
      status: 'ACCEPTED',
      courierId,
      version: 1,
      acceptedAt: expect.any(String),
    });
    expect((await read(id, 'courier')).json()).toMatchObject({ courierId });
    expect((await read(id, 'requester')).json()).toMatchObject({ courierId });
    expect((await read(id, 'other')).statusCode).toBe(404);
    expect(
      (
        await app.inject({ method: 'GET', url: '/api/errands', headers: auth })
      ).json(),
    ).toEqual([]);
    // The winner repeating the request gets the current state, not a second change.
    expect((await accept(id)).json()).toMatchObject({ version: 1 });
    expect(
      await prisma.errandHistory.findMany({ where: { errandId: id } }),
    ).toEqual([
      expect.objectContaining({
        fromStatus: 'OPEN',
        toStatus: 'ACCEPTED',
        action: 'accept',
        actorRole: 'COURIER',
        actorId: courierId,
      }),
    ]);
  });
  it('S4: rejects self-accept, unknown, deleted, taken and pending errands without changing them', async () => {
    const id = (await create()).json().errand.id;
    expect(
      (await app.inject({ method: 'POST', url: `/api/errands/${id}/accept` }))
        .statusCode,
    ).toBe(401);
    expect((await accept(id, 'requester')).json()).toMatchObject({
      code: 'ERRAND_ACTION_FORBIDDEN',
    });
    expect((await accept(id, 'requester')).statusCode).toBe(403);
    expect((await accept(randomUUID())).statusCode).toBe(404);
    loseAck = 'adjust';
    expect(
      (await edit(id, { expectedVersion: 0, offeredCredits: 30 })).statusCode,
    ).toBe(202);
    expect((await accept(id)).json()).toMatchObject({
      code: 'ERRAND_OPERATION_PENDING',
    });
    expect(await prisma.errand.findUnique({ where: { id } })).toMatchObject({
      status: 'OPEN',
      courierId: null,
    });
    const taken = (await create()).json().errand.id;
    expect((await accept(taken)).statusCode).toBe(200);
    const lost = await accept(taken, 'courier-1');
    expect(lost.statusCode).toBe(409);
    expect(lost.json()).toMatchObject({ code: 'ERRAND_INVALID_TRANSITION' });
    const cancelled = (await create()).json().errand.id;
    expect((await remove(cancelled)).statusCode).toBe(200);
    expect((await accept(cancelled)).statusCode).toBe(409);
    const deleted = (await create()).json().errand.id;
    expect((await remove(deleted, 'admin')).statusCode).toBe(200);
    expect((await accept(deleted)).statusCode).toBe(404);
    // The taken errand's accept and the cancel; failed attempts leave no rows.
    expect(await prisma.errandHistory.count()).toBe(2);
  });
  it('S4 race (FR6): 20 parallel accepts give one winner, version +1 once, losers change nothing', async () => {
    for (let round = 0; round < 3; round++) {
      const id = (await create()).json().errand.id;
      const before = await balances();
      const results = await Promise.all(
        Array.from({ length: 20 }, (_, n) => accept(id, `courier-${n + 1}`)),
      );
      const winners = results.filter((result) => result.statusCode === 200);
      expect(winners).toHaveLength(1);
      expect(
        results.filter((result) => result.statusCode === 409),
      ).toHaveLength(19);
      const winner = winners[0].json<{ courierId: string }>().courierId;
      expect(await prisma.errand.findUnique({ where: { id } })).toMatchObject({
        status: 'ACCEPTED',
        courierId: winner,
        version: 1,
      });
      expect((await read(id, 'requester')).json()).toMatchObject({
        courierId: winner,
      });
      expect(
        await prisma.errandHistory.count({ where: { errandId: id } }),
      ).toBe(1);
      expect(await balances()).toEqual(before);
    }
  });
  it('S4 race: the same courier accepting twice in parallel gets the same errand twice', async () => {
    const id = (await create()).json().errand.id;
    const results = await Promise.all([accept(id), accept(id)]);
    expect(results.map((result) => result.statusCode)).toEqual([200, 200]);
    expect(await prisma.errand.findUnique({ where: { id } })).toMatchObject({
      courierId,
      version: 1,
    });
    expect(await prisma.errandHistory.count()).toBe(1);
  });
  const act = (id: string, action: string, token: string) =>
    app.inject({
      method: 'POST',
      url: `/api/errands/${id}/${action}`,
      headers: { authorization: `Bearer ${token}` },
    });
  it('S5: courier picks up and delivers, requester disputes; timestamps and history, no credit movement', async () => {
    const id = (await create()).json().errand.id;
    expect((await accept(id)).statusCode).toBe(200);
    const before = await balances();
    const pickedUp = await act(id, 'pickup', 'courier');
    expect(pickedUp.statusCode).toBe(200);
    expect(pickedUp.json()).toMatchObject({
      status: 'PICKED_UP',
      version: 2,
      pickedUpAt: expect.any(String),
    });
    expect((await act(id, 'deliver', 'courier')).json()).toMatchObject({
      status: 'DELIVERED',
      deliveredAt: expect.any(String),
    });
    expect((await act(id, 'dispute', 'requester')).json()).toMatchObject({
      status: 'DISPUTED',
      version: 4,
      disputedAt: expect.any(String),
      completionMethod: null,
    });
    expect(
      (
        await prisma.errandHistory.findMany({
          where: { errandId: id },
          orderBy: { occurredAt: 'asc' },
        })
      ).map((row) => [row.fromStatus, row.toStatus, row.actorRole]),
    ).toEqual([
      ['OPEN', 'ACCEPTED', 'COURIER'],
      ['ACCEPTED', 'PICKED_UP', 'COURIER'],
      ['PICKED_UP', 'DELIVERED', 'COURIER'],
      ['DELIVERED', 'DISPUTED', 'REQUESTER'],
    ]);
    expect(await balances()).toEqual(before);
  });
  it('S5: wrong actor gets 403, wrong state 409, a repeat returns the current state', async () => {
    const id = (await create()).json().errand.id;
    expect(
      (await app.inject({ method: 'POST', url: `/api/errands/${id}/pickup` }))
        .statusCode,
    ).toBe(401);
    expect((await act(id, 'pickup', 'courier')).statusCode).toBe(403);
    expect((await accept(id)).statusCode).toBe(200);
    expect((await act(id, 'pickup', 'requester')).statusCode).toBe(403);
    expect((await act(id, 'pickup', 'other')).json()).toMatchObject({
      code: 'ERRAND_ACTION_FORBIDDEN',
    });
    expect((await act(id, 'dispute', 'courier')).statusCode).toBe(403);
    expect((await act(id, 'deliver', 'courier')).json()).toMatchObject({
      code: 'ERRAND_INVALID_TRANSITION',
    });
    expect((await act(id, 'pickup', 'courier')).statusCode).toBe(200);
    expect((await act(id, 'dispute', 'requester')).statusCode).toBe(409);
    expect((await act(id, 'pickup', 'courier')).json()).toMatchObject({
      status: 'PICKED_UP',
      version: 2,
    });
    expect((await act(id, 'deliver', 'courier')).statusCode).toBe(200);
    expect((await act(id, 'pickup', 'courier')).statusCode).toBe(409);
    expect((await act(randomUUID(), 'deliver', 'courier')).statusCode).toBe(
      404,
    );
    expect(await prisma.errandHistory.count({ where: { errandId: id } })).toBe(
      3,
    );
  });
  it('S5 race: 10 parallel pickups by the assigned courier apply once', async () => {
    const id = (await create()).json().errand.id;
    await accept(id);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => act(id, 'pickup', 'courier')),
    );
    expect(results.every((result) => result.statusCode === 200)).toBe(true);
    expect(await prisma.errand.findUnique({ where: { id } })).toMatchObject({
      status: 'PICKED_UP',
      version: 2,
    });
    expect(await prisma.errandHistory.count({ where: { errandId: id } })).toBe(
      2,
    );
  });
  /** Creates an errand and walks it to `status` through the real routes. */
  const errandIn = async (status: 'PICKED_UP' | 'DELIVERED') => {
    const id = (await create()).json().errand.id;
    await accept(id);
    await act(id, 'pickup', 'courier');
    if (status === 'DELIVERED') await act(id, 'deliver', 'courier');
    return id as string;
  };
  it('S6a: requester confirms; errand.completed.v1 is written once with exactly the credit payload', async () => {
    const id = await errandIn('DELIVERED');
    const correlationId = randomUUID();
    const response = await app.inject({
      method: 'POST',
      url: `/api/errands/${id}/confirm`,
      headers: {
        authorization: 'Bearer requester',
        'x-correlation-id': correlationId,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'COMPLETED',
      completionMethod: 'REQUESTER_CONFIRMED',
      completedAt: expect.any(String),
    });
    expect((await act(id, 'confirm', 'requester')).statusCode).toBe(200);
    const events = await prisma.outboxEvent.findMany();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      aggregateId: id,
      eventType: 'errand.completed.v1',
      headers: { 'x-correlation-id': correlationId },
      publishedAt: null,
    });
    expect(events[0].payload).toStrictEqual({
      errandId: id,
      requesterId,
      courierId,
      amount: input.offeredCredits,
    });
  });
  it('S6a contract: credit-service settles the stored event, paying the courier once', async () => {
    expect(
      (
        await creditApp.inject({
          method: 'POST',
          url: '/v1/credit-accounts',
          headers: {
            authorization: `Bearer ${process.env.CREDIT_USER_SERVICE_TOKEN}`,
          },
          payload: { userId: courierId },
        })
      ).statusCode,
    ).toBe(201);
    const id = await errandIn('PICKED_UP');
    expect((await act(id, 'confirm', 'requester')).json()).toMatchObject({
      status: 'COMPLETED',
      completionMethod: 'REQUESTER_CONFIRMED',
    });
    const event = await prisma.outboxEvent.findFirstOrThrow({
      where: { aggregateId: id },
    });
    const envelope = {
      eventId: event.id,
      eventType: event.eventType,
      data: event.payload as never,
    };
    const handler = creditApp.get(CreditEventsHandler);
    await handler.handleErrandCompleted(envelope);
    await handler.handleErrandCompleted(envelope);
    const account = (userId: string) =>
      creditPrisma.creditAccount.findUnique({ where: { userId } });
    expect(await account(requesterId)).toMatchObject({
      availableCredits: 80,
      reservedCredits: 0,
    });
    expect(await account(courierId)).toMatchObject({ availableCredits: 120 });
  });
  it('S6a: only the requester confirms, and only from PICKED_UP or DELIVERED', async () => {
    const id = (await create()).json().errand.id;
    expect((await act(id, 'confirm', 'requester')).statusCode).toBe(409);
    await accept(id);
    expect((await act(id, 'confirm', 'requester')).statusCode).toBe(409);
    await act(id, 'pickup', 'courier');
    expect((await act(id, 'confirm', 'courier')).statusCode).toBe(403);
    expect((await act(id, 'confirm', 'other')).statusCode).toBe(403);
    await act(id, 'deliver', 'courier');
    await act(id, 'dispute', 'requester');
    expect((await act(id, 'confirm', 'requester')).statusCode).toBe(409);
    expect(await prisma.outboxEvent.count()).toBe(0);
  });
  it('S6a race: confirm vs dispute on DELIVERED has exactly one winner', async () => {
    for (let round = 0; round < 5; round++) {
      const id = await errandIn('DELIVERED');
      const results = await Promise.all([
        act(id, 'confirm', 'requester'),
        act(id, 'dispute', 'requester'),
      ]);
      expect(results.map((result) => result.statusCode).sort()).toEqual([
        200, 409,
      ]);
      const { status } = await prisma.errand.findUniqueOrThrow({
        where: { id },
      });
      expect(
        await prisma.outboxEvent.count({ where: { aggregateId: id } }),
      ).toBe(status === 'COMPLETED' ? 1 : 0);
      expect(
        await prisma.errandHistory.count({ where: { errandId: id } }),
      ).toBe(4);
    }
  });
  it('S6a race: early confirm vs deliver always ends COMPLETED with one event', async () => {
    for (let round = 0; round < 5; round++) {
      const id = await errandIn('PICKED_UP');
      const [confirmed, delivered] = await Promise.all([
        act(id, 'confirm', 'requester'),
        act(id, 'deliver', 'courier'),
      ]);
      // If deliver commits first, confirm re-reads DELIVERED and still completes.
      expect(confirmed.statusCode).toBe(200);
      expect(await prisma.errand.findUnique({ where: { id } })).toMatchObject({
        status: 'COMPLETED',
        completionMethod: 'REQUESTER_CONFIRMED',
      });
      expect(
        await prisma.outboxEvent.count({ where: { aggregateId: id } }),
      ).toBe(1);
      expect(
        await prisma.errandHistory.count({ where: { errandId: id } }),
      ).toBe(delivered.statusCode === 200 ? 4 : 3);
    }
  });
  it('S6a race: 10 parallel confirms produce one completion and one event', async () => {
    const id = await errandIn('DELIVERED');
    const results = await Promise.all(
      Array.from({ length: 10 }, () => act(id, 'confirm', 'requester')),
    );
    expect(results.every((result) => result.statusCode === 200)).toBe(true);
    expect(await prisma.outboxEvent.count({ where: { aggregateId: id } })).toBe(
      1,
    );
    expect(await prisma.errand.findUnique({ where: { id } })).toMatchObject({
      status: 'COMPLETED',
      version: 4,
    });
  });
  /** Relay wired to an in-memory confirm channel; `nack` makes the broker reject. */
  function fakeRelay() {
    const sent: { routingKey: string; body: unknown; options: unknown }[] = [];
    const broker = { nack: false };
    const channel = {
      assertExchange: jest.fn(() => Promise.resolve()),
      close: () => Promise.resolve(),
      publish: (
        _exchange: string,
        routingKey: string,
        content: Buffer,
        options: unknown,
        done: (error: Error | null) => void,
      ) => {
        if (broker.nack) return done(new Error('nack'));
        sent.push({
          routingKey,
          body: JSON.parse(content.toString()),
          options,
        });
        done(null);
      },
    };
    class TestRelay extends OutboxRelay {
      protected open() {
        return Promise.resolve({
          on: () => undefined,
          close: () => Promise.resolve(),
          createConfirmChannel: () => Promise.resolve(channel),
        } as unknown as ChannelModel);
      }
    }
    const relay = new TestRelay(
      prisma,
      new ConfigService({ ORDER_EVENTS_ENABLED: 'true' }),
    );
    return { relay, sent, broker, channel };
  }
  it("S6a relay: publishes credit's envelope after broker confirm, once per event", async () => {
    const id = await errandIn('DELIVERED');
    const correlationId = randomUUID();
    await app.inject({
      method: 'POST',
      url: `/api/errands/${id}/confirm`,
      headers: {
        authorization: 'Bearer requester',
        'x-correlation-id': correlationId,
      },
    });
    const event = await prisma.outboxEvent.findFirstOrThrow();
    const { relay, sent, channel } = fakeRelay();
    expect(await relay.publishPending()).toBe(1);
    expect(channel.assertExchange).toHaveBeenCalledWith('foc.events', 'topic', {
      durable: true,
    });
    expect(sent).toEqual([
      {
        routingKey: 'errand.completed.v1',
        body: {
          pattern: 'errand.completed.v1',
          data: {
            eventId: event.id,
            eventType: 'errand.completed.v1',
            data: { errandId: id, requesterId, courierId, amount: 20 },
          },
        },
        options: expect.objectContaining({
          deliveryMode: 2,
          messageId: event.id,
          contentType: 'application/json',
          headers: { 'x-correlation-id': correlationId },
        }),
      },
    ]);
    expect(
      (await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } }))
        .publishedAt,
    ).toBeInstanceOf(Date);
    expect(await relay.publishPending()).toBe(0);
    expect(sent).toHaveLength(1);
    await relay.onModuleDestroy();
  });
  it('S6a relay: a broker rejection keeps the row pending and the retry reuses the eventId', async () => {
    const id = await errandIn('DELIVERED');
    await act(id, 'confirm', 'requester');
    const { relay, sent, broker } = fakeRelay();
    broker.nack = true;
    expect(await relay.publishPending()).toBe(0);
    expect(
      await prisma.outboxEvent.count({ where: { publishedAt: null } }),
    ).toBe(1);
    broker.nack = false;
    expect(await relay.publishPending()).toBe(1);
    const event = await prisma.outboxEvent.findFirstOrThrow();
    expect(sent.map((message) => message.options)).toEqual([
      expect.objectContaining({ messageId: event.id }),
    ]);
    expect(event.publishedAt).toBeInstanceOf(Date);
    await relay.onModuleDestroy();
  });
  /** Moves an errand's lifecycle timestamps into the past instead of waiting. */
  const age = (id: string, interval: string) =>
    prisma.$executeRaw`UPDATE "errands" SET "accepted_at" = "accepted_at" - ${interval}::interval, "picked_up_at" = "picked_up_at" - ${interval}::interval, "delivered_at" = "delivered_at" - ${interval}::interval WHERE "id" = ${id}::uuid`;
  it('S6b: a DELIVERED errand completes automatically after 4 h with one event (D-008)', async () => {
    const due = await errandIn('DELIVERED');
    const early = await errandIn('DELIVERED');
    await age(due, '4 hours 1 second');
    await age(early, '3 hours 59 minutes');
    expect(await service.autoComplete(early)).toBe(false);
    expect(
      await app.get<OrderRepository>(ORDER_REPOSITORY).dueAutoCompletions(),
    ).toEqual([due]);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => service.autoComplete(due)),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(
      await prisma.errand.findUnique({ where: { id: due } }),
    ).toMatchObject({ status: 'COMPLETED', completionMethod: 'AUTO_TIMEOUT' });
    expect(await prisma.outboxEvent.findMany()).toEqual([
      expect.objectContaining({
        aggregateId: due,
        payload: { errandId: due, requesterId, courierId, amount: 20 },
      }),
    ]);
    expect(
      await prisma.errandHistory.findFirst({
        where: { errandId: due, toStatus: 'COMPLETED' },
      }),
    ).toMatchObject({
      actorRole: 'SYSTEM',
      actorId: null,
      action: 'auto-complete',
    });
    expect(
      await prisma.errand.findUnique({ where: { id: early } }),
    ).toMatchObject({ status: 'DELIVERED', completionMethod: null });
    expect((await act(due, 'confirm', 'requester')).statusCode).toBe(200);
    expect(await prisma.outboxEvent.count()).toBe(1);
  });
  it('S6b: a dispute at 3h59m wins; the later job is a no-op', async () => {
    const id = await errandIn('DELIVERED');
    await age(id, '3 hours 59 minutes');
    expect((await act(id, 'dispute', 'requester')).statusCode).toBe(200);
    await age(id, '2 minutes');
    expect(
      await app.get<OrderRepository>(ORDER_REPOSITORY).dueAutoCompletions(),
    ).toEqual([]);
    expect(await service.autoComplete(id)).toBe(false);
    expect(await prisma.errand.findUnique({ where: { id } })).toMatchObject({
      status: 'DISPUTED',
    });
    expect(await prisma.outboxEvent.count()).toBe(0);
  });
  it('S6b race: requester confirm vs the 4 h job completes once', async () => {
    for (let round = 0; round < 5; round++) {
      const id = await errandIn('DELIVERED');
      await age(id, '5 hours');
      const [confirmed, timed] = await Promise.all([
        act(id, 'confirm', 'requester'),
        service.autoComplete(id),
      ]);
      expect(confirmed.statusCode).toBe(200);
      const errand = await prisma.errand.findUniqueOrThrow({ where: { id } });
      expect(errand.completionMethod).toBe(
        timed ? 'AUTO_TIMEOUT' : 'REQUESTER_CONFIRMED',
      );
      expect(
        await prisma.outboxEvent.count({ where: { aggregateId: id } }),
      ).toBe(1);
    }
  });
  const list = (url: string, token: string) =>
    app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${token}` },
    });
  it('D3 queries: courier assignments, admin view of one requester, availableForAcceptance', async () => {
    const open = (await create()).json().errand.id;
    const taken = (await create()).json().errand.id;
    const own = (await create(input, randomUUID(), 'other')).json().errand.id;
    expect((await read(open, 'courier')).json()).toMatchObject({
      availableForAcceptance: true,
    });
    await accept(taken);
    expect((await read(taken, 'courier')).json()).toMatchObject({
      availableForAcceptance: false,
    });
    expect(
      (await list('/api/errands/assigned', 'courier'))
        .json<{ id: string }[]>()
        .map((errand) => errand.id),
    ).toEqual([taken]);
    expect((await list('/api/errands/assigned', 'requester')).json()).toEqual(
      [],
    );
    const ids = (response: { json: () => unknown }) =>
      (response.json() as { id: string }[]).map((errand) => errand.id).sort();
    expect(
      ids(
        await list(`/api/errands/manage?requesterId=${requesterId}`, 'admin'),
      ),
    ).toEqual([open, taken].sort());
    expect(ids(await list('/api/errands/manage', 'admin'))).toEqual(
      [open, taken, own].sort(),
    );
    expect(
      ids(
        await list(
          `/api/errands/manage?requesterId=${requesterId}`,
          'requester',
        ),
      ),
    ).toEqual([open, taken].sort());
    const forbidden = await list(
      `/api/errands/manage?requesterId=${otherId}`,
      'requester',
    );
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json()).toMatchObject({ code: 'ADMINISTRATOR_REQUIRED' });
    expect(
      (await list('/api/errands/manage?requesterId=nope', 'admin')).statusCode,
    ).toBe(400);
    expect(
      (await list(`/api/errands?requesterId=${requesterId}`, 'admin'))
        .statusCode,
    ).toBe(400);
  });
  const cancel = (id: string, token = 'requester') =>
    app.inject({
      method: 'POST',
      url: `/api/errands/${id}/cancel`,
      headers: { authorization: `Bearer ${token}` },
    });
  const releases = () =>
    creditPrisma.ledgerEntry.count({ where: { type: 'RELEASE' } });
  const requesterBalance = () =>
    creditPrisma.creditAccount.findUnique({
      where: { userId: requesterId },
      select: { availableCredits: true, reservedCredits: true },
    });
  it('S7: owner DELETE cancels on the same route; the CANCELLED errand stays visible to the requester (D-014)', async () => {
    const id = (await create()).json().errand.id;
    const key = randomUUID();
    expect((await remove(id, 'other')).statusCode).toBe(403);
    const first = await remove(id, 'requester', key);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      status: 'SUCCEEDED',
      errand: { id, status: 'CANCELLED', cancelledAt: expect.any(String) },
    });
    // Same key, a new key and the POST route all return the one cancel operation.
    for (const repeat of [
      await remove(id, 'requester', key),
      await remove(id),
      await cancel(id),
    ]) {
      expect(repeat.statusCode).toBe(200);
      expect(repeat.json()).toMatchObject({
        operationId: first.json().operationId,
        errand: { status: 'CANCELLED' },
      });
    }
    expect(await prisma.errand.findUnique({ where: { id } })).toMatchObject({
      status: 'CANCELLED',
      deletedAt: null,
    });
    expect((await read(id, 'requester')).json()).toMatchObject({
      status: 'CANCELLED',
      availableForAcceptance: false,
    });
    expect(
      (await list('/api/errands/manage', 'requester'))
        .json<{ id: string; status: string }[]>()
        .map((errand) => [errand.id, errand.status]),
    ).toEqual([[id, 'CANCELLED']]);
    expect((await list('/api/errands', 'courier')).json()).toEqual([]);
    expect(await requesterBalance()).toEqual({
      availableCredits: 100,
      reservedCredits: 0,
    });
    expect(await releases()).toBe(1);
    expect(
      await prisma.errandHistory.findMany({ where: { errandId: id } }),
    ).toEqual([
      expect.objectContaining({
        fromStatus: 'OPEN',
        toStatus: 'CANCELLED',
        action: 'cancel',
        actorRole: 'REQUESTER',
        actorId: requesterId,
        courierId: null,
      }),
    ]);
  });
  it('S7: cancelling an ACCEPTED errand releases the whole escrow and the courier (D-015)', async () => {
    const id = (await create()).json().errand.id;
    expect((await accept(id)).statusCode).toBe(200);
    const response = await cancel(id);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'SUCCEEDED',
      errand: { status: 'CANCELLED', courierId: null, acceptedAt: null },
    });
    expect(await requesterBalance()).toEqual({
      availableCredits: 100,
      reservedCredits: 0,
    });
    expect(await releases()).toBe(1);
    // The released courier can no longer read or act on the errand.
    expect((await read(id, 'courier')).statusCode).toBe(404);
    expect((await act(id, 'pickup', 'courier')).statusCode).toBe(403);
    expect((await list('/api/errands/assigned', 'courier')).json()).toEqual([]);
    expect(
      await prisma.errandHistory.findFirst({
        where: { errandId: id, action: 'cancel' },
      }),
    ).toMatchObject({
      fromStatus: 'ACCEPTED',
      toStatus: 'CANCELLED',
      actorId: requesterId,
      courierId,
    });
  });
  it('S7: cancel is 409 from PICKED_UP onward, 403 for anyone but the requester, and never moves credits then', async () => {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/errands/${randomUUID()}/cancel`,
        })
      ).statusCode,
    ).toBe(401);
    expect((await cancel(randomUUID())).statusCode).toBe(404);
    const open = (await create()).json().errand.id;
    expect((await cancel(open, 'other')).json()).toMatchObject({
      code: 'ERRAND_OWNER_REQUIRED',
    });
    const picked = await errandIn('PICKED_UP');
    expect((await cancel(picked, 'courier')).statusCode).toBe(403);
    for (const id of [picked, await errandIn('DELIVERED')]) {
      for (const response of [await cancel(id), await remove(id)]) {
        expect(response.statusCode).toBe(409);
        expect(response.json()).toMatchObject({
          code: 'ERRAND_INVALID_TRANSITION',
        });
      }
    }
    const disputed = await errandIn('DELIVERED');
    await act(disputed, 'dispute', 'requester');
    expect((await cancel(disputed)).statusCode).toBe(409);
    expect(await releases()).toBe(0);
    expect(
      await prisma.errandOperation.count({ where: { kind: 'CANCEL' } }),
    ).toBe(0);
  });
  it('S7: a lost release acknowledgement keeps the cancel pending and locked until a repeat completes it once', async () => {
    const id = (await create()).json().errand.id;
    await accept(id);
    loseAck = 'release';
    const pending = await cancel(id);
    expect(pending.statusCode).toBe(202);
    expect(pending.json()).toMatchObject({ status: 'PENDING', errand: null });
    // While the release is in doubt the courier cannot pick up.
    expect((await act(id, 'pickup', 'courier')).json()).toMatchObject({
      code: 'ERRAND_OPERATION_PENDING',
    });
    // Repeating the request resumes the same operation instead of starting another.
    const repeat = await cancel(id);
    expect(repeat.statusCode).toBe(200);
    expect(repeat.json()).toMatchObject({
      operationId: pending.json().operationId,
      status: 'SUCCEEDED',
    });
    expect((await service.process(pending.json().operationId)).status).toBe(
      'SUCCEEDED',
    );
    expect(await prisma.errand.findUnique({ where: { id } })).toMatchObject({
      status: 'CANCELLED',
      courierId: null,
      pendingOperationId: null,
    });
    expect(await releases()).toBe(1);
    expect(await requesterBalance()).toEqual({
      availableCredits: 100,
      reservedCredits: 0,
    });
  });
  it('S8: the courier gives an ACCEPTED errand back; it reopens with credits reserved and that courier excluded (D-016)', async () => {
    const id = (await create()).json().errand.id;
    await accept(id);
    const response = await act(id, 'courier-cancel', 'courier');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id,
      status: 'OPEN',
      courierId: null,
      acceptedAt: null,
      version: 2,
      availableForAcceptance: false,
    });
    expect(await requesterBalance()).toEqual({
      availableCredits: 80,
      reservedCredits: 20,
    });
    expect(await releases()).toBe(0);
    expect(
      await prisma.errandHistory.findFirst({
        where: { errandId: id, action: 'courier-cancel' },
      }),
    ).toMatchObject({
      fromStatus: 'ACCEPTED',
      toStatus: 'OPEN',
      actorRole: 'COURIER',
      actorId: courierId,
      courierId,
    });
    expect(await prisma.errandExcludedCourier.findMany()).toEqual([
      expect.objectContaining({ errandId: id, courierId }),
    ]);
    // A repeat returns the current state; nothing else is written.
    expect((await act(id, 'courier-cancel', 'courier')).json()).toMatchObject({
      status: 'OPEN',
      version: 2,
    });
    expect(await prisma.errandHistory.count({ where: { errandId: id } })).toBe(
      2,
    );
    const again = await accept(id);
    expect(again.statusCode).toBe(403);
    expect(again.json()).toMatchObject({ code: 'ERRAND_COURIER_EXCLUDED' });
    // Back on the board for everyone else, and editable by the requester again.
    expect(
      (await list('/api/errands', 'courier-1')).json<{ id: string }[]>(),
    ).toEqual([expect.objectContaining({ id })]);
    expect((await read(id, 'courier-1')).json()).toMatchObject({
      availableForAcceptance: true,
    });
    expect(
      (await edit(id, { expectedVersion: 2, description: 'Reopened' }))
        .statusCode,
    ).toBe(200);
    expect((await accept(id, 'courier-1')).statusCode).toBe(200);
    // Excluded from this errand only.
    const other = (await create()).json().errand.id;
    expect((await accept(other)).statusCode).toBe(200);
  });
  it('S8: courier cancel is for the assigned courier only, and 409 after pickup (Q-020)', async () => {
    const id = (await create()).json().errand.id;
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/errands/${id}/courier-cancel`,
        })
      ).statusCode,
    ).toBe(401);
    expect((await act(id, 'courier-cancel', 'courier')).statusCode).toBe(403);
    await accept(id);
    expect((await act(id, 'courier-cancel', 'requester')).json()).toMatchObject(
      { code: 'ERRAND_ACTION_FORBIDDEN' },
    );
    expect((await act(id, 'courier-cancel', 'courier-1')).statusCode).toBe(403);
    await act(id, 'pickup', 'courier');
    const late = await act(id, 'courier-cancel', 'courier');
    expect(late.statusCode).toBe(409);
    expect(late.json()).toMatchObject({ code: 'ERRAND_INVALID_TRANSITION' });
    expect(await prisma.errand.findUnique({ where: { id } })).toMatchObject({
      status: 'PICKED_UP',
      courierId,
    });
    expect(await prisma.errandExcludedCourier.count()).toBe(0);
  });
  it('S8: an ACCEPTED errand not picked up within 30 minutes reopens and excludes that courier (D-017)', async () => {
    const repository = app.get<OrderRepository>(ORDER_REPOSITORY);
    const due = (await create()).json().errand.id;
    const early = (await create()).json().errand.id;
    await accept(due);
    await accept(early);
    await age(due, '30 minutes 1 second');
    await age(early, '29 minutes');
    expect(await service.reopen(early)).toBe(false);
    expect(await repository.dueReopens()).toEqual([due]);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => service.reopen(due)),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(
      await prisma.errand.findUnique({ where: { id: due } }),
    ).toMatchObject({
      status: 'OPEN',
      courierId: null,
      acceptedAt: null,
      version: 2,
    });
    expect(
      await prisma.errandHistory.findFirst({
        where: { errandId: due, action: 'reopen' },
      }),
    ).toMatchObject({
      fromStatus: 'ACCEPTED',
      toStatus: 'OPEN',
      actorRole: 'SYSTEM',
      actorId: null,
      courierId,
    });
    expect(await repository.dueReopens()).toEqual([]);
    expect((await accept(due)).json()).toMatchObject({
      code: 'ERRAND_COURIER_EXCLUDED',
    });
    expect((await accept(due, 'courier-1')).statusCode).toBe(200);
    expect(
      await prisma.errand.findUnique({ where: { id: early } }),
    ).toMatchObject({ status: 'ACCEPTED', courierId });
    // Reopening never touches the reservation.
    expect(await requesterBalance()).toEqual({
      availableCredits: 60,
      reservedCredits: 40,
    });
  });
  it('S8: a pickup or a requester cancel before the job runs makes the reopen a no-op', async () => {
    const picked = (await create()).json().errand.id;
    const cancelled = (await create()).json().errand.id;
    for (const id of [picked, cancelled]) {
      await accept(id);
      await age(id, '29 minutes 59 seconds');
    }
    expect((await act(picked, 'pickup', 'courier')).statusCode).toBe(200);
    expect((await cancel(cancelled)).statusCode).toBe(200);
    for (const id of [picked, cancelled]) await age(id, '1 minute');
    expect(
      await app.get<OrderRepository>(ORDER_REPOSITORY).dueReopens(),
    ).toEqual([]);
    expect(await service.reopen(picked)).toBe(false);
    expect(await service.reopen(cancelled)).toBe(false);
    expect(
      await prisma.errand.findUnique({ where: { id: picked } }),
    ).toMatchObject({ status: 'PICKED_UP', courierId });
    expect(
      await prisma.errand.findUnique({ where: { id: cancelled } }),
    ).toMatchObject({ status: 'CANCELLED' });
    expect(await prisma.errandExcludedCourier.count()).toBe(0);
  });
  it('admins can inspect/manage/delete all requests and edit only their own', async () => {
    const id = (await create()).json().errand.id;
    await prisma.errand.update({
      where: { id },
      data: {
        status: 'PICKED_UP',
        courierId: otherId,
        acceptedAt: new Date(),
        pickedUpAt: new Date(),
      },
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
      data: {
        status: 'COMPLETED',
        courierId: otherId,
        acceptedAt: new Date(),
        pickedUpAt: new Date(),
        completedAt: new Date(),
        completionMethod: 'REQUESTER_CONFIRMED',
      },
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
  it('carries one correlation id from the request to credit-service ledger rows (NFR8)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/errands',
      headers: {
        authorization: 'Bearer requester',
        'idempotency-key': randomUUID(),
        'x-correlation-id': 'demo-create-1',
      },
      payload: input,
    });
    expect(response.statusCode).toBe(201);
    expect(response.headers['x-correlation-id']).toBe('demo-create-1');
    const errandId = response.json<{ errand: { id: string } }>().errand.id;
    expect(
      await creditPrisma.ledgerEntry.findFirst({ where: { errandId } }),
    ).toMatchObject({ correlationId: 'demo-create-1' });
    expect(
      await prisma.errandOperation.findFirst({ where: { errandId } }),
    ).toMatchObject({ correlationId: 'demo-create-1' });
    const generated = await app.inject({
      method: 'GET',
      url: '/api/errands',
      headers: auth,
    });
    expect(generated.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
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
      data: { status: 'ACCEPTED', courierId: otherId, acceptedAt: new Date() },
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
  it('S3: per-state CHECKs reject lifecycle rows missing their transition facts', async () => {
    const id = (await create()).json().errand.id;
    const at = new Date('2026-10-18T10:00:00Z');
    const later = new Date('2026-10-18T10:05:00Z');
    const rejected = async (data: object, constraint: string) =>
      expect(prisma.errand.update({ where: { id }, data })).rejects.toThrow(
        constraint,
      );
    await rejected(
      { status: 'ACCEPTED', courierId: otherId },
      'errands_assigned_states',
    );
    await rejected(
      { status: 'PICKED_UP', courierId: otherId, acceptedAt: at },
      'errands_picked_up_states',
    );
    await rejected(
      {
        status: 'DISPUTED',
        courierId: otherId,
        acceptedAt: at,
        pickedUpAt: at,
        deliveredAt: at,
      },
      'errands_disputed_state',
    );
    await rejected(
      {
        status: 'COMPLETED',
        courierId: otherId,
        acceptedAt: at,
        pickedUpAt: at,
        completedAt: at,
      },
      'errands_completion',
    );
    await rejected(
      {
        status: 'COMPLETED',
        courierId: otherId,
        acceptedAt: at,
        pickedUpAt: at,
        completedAt: at,
        completionMethod: 'AUTO_TIMEOUT',
      },
      'errands_completion',
    );
    await rejected(
      {
        status: 'PICKED_UP',
        courierId: otherId,
        acceptedAt: later,
        pickedUpAt: at,
      },
      'errands_lifecycle_order',
    );
    await rejected({ status: 'CANCELLED' }, 'errands_cancelled_state');
    await rejected({ cancelledAt: at }, 'errands_cancelled_state');
    await rejected({ status: 'EXPIRED' }, 'errands_expired_state');
    await rejected({ expiredAt: at }, 'errands_expired_state');
    await rejected(
      {
        status: 'CANCELLED',
        cancelledAt: at,
        courierId: otherId,
        acceptedAt: at,
      },
      'errands_closed_unassigned',
    );
    await rejected(
      { status: 'EXPIRED', expiredAt: at, acceptedAt: at },
      'errands_closed_unassigned',
    );
    await prisma.errand.update({
      where: { id },
      data: {
        status: 'DISPUTED',
        courierId: otherId,
        acceptedAt: at,
        pickedUpAt: at,
        deliveredAt: at,
        disputedAt: later,
      },
    });
    await prisma.errandHistory.create({
      data: {
        errandId: id,
        fromStatus: 'DELIVERED',
        toStatus: 'DISPUTED',
        action: 'dispute',
        actorRole: 'REQUESTER',
        actorId: requesterId,
      },
    });
    await expect(
      prisma.errandHistory.create({
        data: {
          errandId: id,
          toStatus: 'COMPLETED',
          action: 'auto-complete',
          actorRole: 'SYSTEM',
          actorId: requesterId,
        },
      }),
    ).rejects.toThrow('errand_history_actor');
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/errands/${id}`,
          headers: auth,
        })
      ).json(),
    ).toMatchObject({
      status: 'DISPUTED',
      disputedAt: later.toISOString(),
      completionMethod: null,
    });
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
