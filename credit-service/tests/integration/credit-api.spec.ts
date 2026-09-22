import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/api/http-exception.filter';
import { PrismaService } from '../../src/infrastructure/prisma.service';

describe('Credit API with PostgreSQL', () => {
  const authorization = `Bearer ${process.env.CREDIT_INTERNAL_API_TOKEN}`;
  let container: StartedPostgreSqlContainer;
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
    process.env.DATABASE_URL = container.getConnectionUri();
    process.env.CREDIT_INITIAL_BALANCE = '100';
    process.env.CREDIT_TRANSACTION_RETRIES = '8';
    process.env.LOG_LEVEL = 'silent';

    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query(
      readFileSync(
        join(
          __dirname,
          '../../migrations/202609200001_init/migration.sql',
        ),
        'utf8',
      ),
    );
    await client.end();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  beforeEach(async () => {
    await prisma.creditLedgerEntry.deleteMany();
    await prisma.creditReservation.deleteMany();
    await prisma.creditAccount.deleteMany();
  });

  const initialize = async (userId = randomUUID()) => {
    await request(app.getHttpServer())
      .post('/v1/credit-accounts')
      .set('authorization', authorization)
      .send({ userId })
      .expect(201);
    return userId;
  };

  it('initializes an account exactly once', async () => {
    const userId = randomUUID();
    const first = await request(app.getHttpServer())
      .post('/v1/credit-accounts')
      .set('authorization', authorization)
      .set('x-correlation-id', 'initialize-test')
      .send({ userId })
      .expect('x-correlation-id', 'initialize-test')
      .expect(201);
    const duplicate = await request(app.getHttpServer())
      .post('/v1/credit-accounts')
      .set('authorization', authorization)
      .send({ userId })
      .expect(200);

    expect(first.body).toMatchObject({
      userId,
      availableCredits: 100,
      reservedCredits: 0,
      replayed: false,
    });
    expect(duplicate.body).toMatchObject({
      availableCredits: 100,
      replayed: true,
    });
    expect(await prisma.creditLedgerEntry.count()).toBe(1);
  });

  it('rejects insufficient credits and rolls the transaction back', async () => {
    const requesterId = await initialize();
    const response = await request(app.getHttpServer())
      .post('/v1/credit-reservations')
      .set('authorization', authorization)
      .send({ errandId: randomUUID(), requesterId, amount: 101 })
      .expect(422);

    expect(response.body.code).toBe('INSUFFICIENT_CREDITS');
    const account = await prisma.creditAccount.findUniqueOrThrow({
      where: { userId: requesterId },
    });
    expect(account).toMatchObject({ availableCredits: 100, reservedCredits: 0 });
    expect(await prisma.creditReservation.count()).toBe(0);
  });

  it('prevents concurrent reservations from overspending', async () => {
    const requesterId = await initialize();
    const responses = await Promise.all([
      request(app.getHttpServer())
        .post('/v1/credit-reservations')
        .set('authorization', authorization)
        .send({ errandId: randomUUID(), requesterId, amount: 70 }),
      request(app.getHttpServer())
        .post('/v1/credit-reservations')
        .set('authorization', authorization)
        .send({ errandId: randomUUID(), requesterId, amount: 70 }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 422]);
    const account = await prisma.creditAccount.findUniqueOrThrow({
      where: { userId: requesterId },
    });
    expect(account).toMatchObject({ availableCredits: 30, reservedCredits: 70 });
    expect(await prisma.creditReservation.count()).toBe(1);
  });

  it('deduplicates concurrent reservation retries', async () => {
    const requesterId = await initialize();
    const errandId = randomUUID();
    const responses = await Promise.all([
      request(app.getHttpServer())
        .post('/v1/credit-reservations')
        .set('authorization', authorization)
        .send({ errandId, requesterId, amount: 30 }),
      request(app.getHttpServer())
        .post('/v1/credit-reservations')
        .set('authorization', authorization)
        .send({ errandId, requesterId, amount: 30 }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
    const account = await prisma.creditAccount.findUniqueOrThrow({
      where: { userId: requesterId },
    });
    expect(account).toMatchObject({ availableCredits: 70, reservedCredits: 30 });
    expect(await prisma.creditReservation.count()).toBe(1);
  });

  it('settles once when completion delivery is duplicated', async () => {
    const requesterId = await initialize();
    const courierId = await initialize();
    const errandId = randomUUID();
    await request(app.getHttpServer())
      .post('/v1/credit-reservations')
      .set('authorization', authorization)
      .send({ errandId, requesterId, amount: 35 })
      .expect(201);

    const responses = await Promise.all([
      request(app.getHttpServer())
        .post(`/v1/credit-reservations/${errandId}/settlement`)
        .set('authorization', authorization)
        .send({ courierId }),
      request(app.getHttpServer())
        .post(`/v1/credit-reservations/${errandId}/settlement`)
        .set('authorization', authorization)
        .send({ courierId }),
    ]);
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(responses.filter((response) => response.body.replayed).length).toBe(1);

    const requester = await prisma.creditAccount.findUniqueOrThrow({
      where: { userId: requesterId },
    });
    const courier = await prisma.creditAccount.findUniqueOrThrow({
      where: { userId: courierId },
    });
    expect(requester).toMatchObject({ availableCredits: 65, reservedCredits: 0 });
    expect(courier).toMatchObject({ availableCredits: 135, reservedCredits: 0 });
    expect(
      await prisma.creditLedgerEntry.count({
        where: { reservation: { errandId } },
      }),
    ).toBe(3);
  });

  it('releases once and rejects a later settlement', async () => {
    const requesterId = await initialize();
    const courierId = await initialize();
    const errandId = randomUUID();
    await request(app.getHttpServer())
      .post('/v1/credit-reservations')
      .set('authorization', authorization)
      .send({ errandId, requesterId, amount: 45 })
      .expect(201);

    const first = await request(app.getHttpServer())
      .post(`/v1/credit-reservations/${errandId}/release`)
      .set('authorization', authorization)
      .expect(200);
    const retry = await request(app.getHttpServer())
      .post(`/v1/credit-reservations/${errandId}/release`)
      .set('authorization', authorization)
      .expect(200);
    expect(first.body.replayed).toBe(false);
    expect(retry.body.replayed).toBe(true);

    await request(app.getHttpServer())
      .post(`/v1/credit-reservations/${errandId}/settlement`)
      .set('authorization', authorization)
      .send({ courierId })
      .expect(409);
    const requester = await prisma.creditAccount.findUniqueOrThrow({
      where: { userId: requesterId },
    });
    expect(requester).toMatchObject({ availableCredits: 100, reservedCredits: 0 });
  });

  it('validates UUID and amount DTOs', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/credit-reservations')
      .set('authorization', authorization)
      .send({ errandId: 'bad-id', requesterId: randomUUID(), amount: 0 })
      .expect(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.message).toHaveLength(2);
  });

  it('rejects every unauthorized mutation without changing persistent state', async () => {
    const blockedUserId = randomUUID();
    await request(app.getHttpServer())
      .post('/v1/credit-accounts')
      .send({ userId: blockedUserId })
      .expect(401);
    await request(app.getHttpServer())
      .post('/v1/credit-accounts')
      .set('authorization', 'Bearer invalid-but-well-formed-token')
      .send({ userId: blockedUserId })
      .expect(403);
    expect(await prisma.creditAccount.count()).toBe(0);

    const requesterId = await initialize();
    const courierId = await initialize();
    const errandId = randomUUID();
    await request(app.getHttpServer())
      .post('/v1/credit-reservations')
      .set('authorization', authorization)
      .send({ errandId, requesterId, amount: 20 })
      .expect(201);
    const ledgerCount = await prisma.creditLedgerEntry.count();

    await request(app.getHttpServer())
      .post('/v1/credit-reservations')
      .send({ errandId: randomUUID(), requesterId, amount: 10 })
      .expect(401);
    await request(app.getHttpServer())
      .post(`/v1/credit-reservations/${errandId}/settlement`)
      .set('authorization', 'Bearer unauthorized-service-token')
      .send({ courierId })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/v1/credit-reservations/${errandId}/release`)
      .expect(401);

    const requester = await prisma.creditAccount.findUniqueOrThrow({
      where: { userId: requesterId },
    });
    const courier = await prisma.creditAccount.findUniqueOrThrow({
      where: { userId: courierId },
    });
    const reservation = await prisma.creditReservation.findUniqueOrThrow({
      where: { errandId },
    });
    expect(requester).toMatchObject({ availableCredits: 80, reservedCredits: 20 });
    expect(courier).toMatchObject({ availableCredits: 100, reservedCredits: 0 });
    expect(reservation.status).toBe('RESERVED');
    expect(await prisma.creditReservation.count()).toBe(1);
    expect(await prisma.creditLedgerEntry.count()).toBe(ledgerCount);
  });

  it('creates indexes for identity, status, foreign-key, and history lookups', async () => {
    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('credit_accounts', 'credit_reservations', 'credit_ledger_entries')
    `;
    const names = indexes.map(({ indexname }) => indexname);

    expect(names).toEqual(
      expect.arrayContaining([
        'credit_accounts_pkey',
        'credit_reservations_errand_id_key',
        'credit_reservations_requester_id_idx',
        'credit_reservations_courier_id_idx',
        'credit_reservations_status_updated_at_idx',
        'credit_ledger_entries_account_user_id_created_at_idx',
        'credit_ledger_entries_reservation_id_idx',
        'credit_ledger_entries_created_at_idx',
      ]),
    );
  });
});
