import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/api/http-exception.filter';
import {
  CreditEventsHandler,
  ERRAND_COMPLETED_EVENT,
  USER_VERIFIED_EVENT,
} from '../../src/api/credit-events.handler';
import { MAX_CREDIT_BALANCE } from '../../src/domain/credit.constants';
import { PrismaService } from '../../src/infrastructure/prisma.service';

describe('Credit API with PostgreSQL', () => {
  const authorization = `Bearer ${process.env.CREDIT_ORDER_SERVICE_TOKEN}`;
  const userServiceAuthorization =
    `Bearer ${process.env.CREDIT_USER_SERVICE_TOKEN}`;
  const monitoringAuthorization =
    `Bearer ${process.env.CREDIT_MONITORING_TOKEN}`;
  const jwt = new JwtService({
    secret: process.env.JWT_ACCESS_TOKEN_SECRET!,
  });
  let container: StartedPostgreSqlContainer;
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let events: CreditEventsHandler;

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
        join(__dirname, '../../migrations/202609200001_init/migration.sql'),
        'utf8',
      ),
    );
    await client.query(
      readFileSync(
        join(
          __dirname,
          '../../migrations/202609270001_harden_settlement_invariants/migration.sql',
        ),
        'utf8',
      ),
    );
    await client.query(
      readFileSync(
        join(
          __dirname,
          '../../migrations/202610040001_refine_reservation_ledger/migration.sql',
        ),
        'utf8',
      ),
    );
    await client.query(
      readFileSync(
        join(
          __dirname,
          '../../migrations/202610120001_complete_credit_contract/migration.sql',
        ),
        'utf8',
      ),
    );
    await client.query(
      readFileSync(
        join(
          __dirname,
          '../../migrations/202610120002_enforce_credit_balance_limit/migration.sql',
        ),
        'utf8',
      ),
    );
    await client.query(
      readFileSync(
        join(
          __dirname,
          '../../migrations/202610120003_add_event_reliability/migration.sql',
        ),
        'utf8',
      ),
    );
    await client.end();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
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
    events = app.get(CreditEventsHandler);
  });

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "outbox_events", "processed_events", "credit_reservation_adjustments", "ledger_entries", "credit_reservations", "credit_accounts" CASCADE',
    );
  });

  const initialize = async (userId = randomUUID()) => {
    await request(app.getHttpServer())
      .post('/v1/credit-accounts')
      .set('authorization', userServiceAuthorization)
      .send({ userId })
      .expect(201);
    return userId;
  };

  const userAuthorization = (userId: string, isAdmin = false) =>
    `Bearer ${jwt.sign(
      {
        sid: randomUUID(),
        isAdmin,
      },
      {
        algorithm: 'HS256',
        audience: 'foc-api',
        expiresIn: 900,
        issuer: 'foc-user-service',
        subject: userId,
      },
    )}`;

  it('initializes an account exactly once', async () => {
    const userId = randomUUID();
    const first = await request(app.getHttpServer())
      .post('/v1/credit-accounts')
      .set('authorization', userServiceAuthorization)
      .set('x-correlation-id', 'initialize-test')
      .send({ userId })
      .expect('x-correlation-id', 'initialize-test')
      .expect(201);
    const duplicate = await request(app.getHttpServer())
      .post('/v1/credit-accounts')
      .set('authorization', userServiceAuthorization)
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
    expect(await prisma.ledgerEntry.count()).toBe(1);
    expect(await prisma.ledgerEntry.findFirstOrThrow()).toMatchObject({
      correlationId: 'initialize-test',
    });
  });

  it('deduplicates a redelivered UserVerified event atomically', async () => {
    const userId = randomUUID();
    const event = {
      eventId: randomUUID(),
      eventType: USER_VERIFIED_EVENT,
      data: { userId },
    };

    await expect(events.handleUserVerified(event)).resolves.toMatchObject({
      replayed: false,
    });
    // Simulates DB commit followed by a consumer crash before broker ACK.
    await expect(events.handleUserVerified(event)).resolves.toMatchObject({
      replayed: true,
    });

    expect(await prisma.creditAccount.count()).toBe(1);
    expect(await prisma.ledgerEntry.count()).toBe(1);
    expect(await prisma.processedEvent.count()).toBe(1);
    await expect(prisma.outboxEvent.findMany()).resolves.toMatchObject([
      { eventType: 'credit.account-initialized.v1', published: false },
    ]);
  });

  it('rejects reuse of an event id with changed content', async () => {
    const eventId = randomUUID();
    await events.handleUserVerified({
      eventId,
      eventType: USER_VERIFIED_EVENT,
      data: { userId: randomUUID() },
    });

    await expect(
      events.handleUserVerified({
        eventId,
        eventType: USER_VERIFIED_EVENT,
        data: { userId: randomUUID() },
      }),
    ).rejects.toMatchObject({ code: 'EVENT_REPLAY_CONFLICT' });
    expect(await prisma.creditAccount.count()).toBe(1);
    expect(await prisma.processedEvent.count()).toBe(1);
  });

  it('restricts balance reads to the account owner or an administrator', async () => {
    const ownerId = await initialize();
    const otherUserId = randomUUID();

    await request(app.getHttpServer())
      .get(`/v1/credit-accounts/${ownerId}`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/v1/credit-accounts/${ownerId}`)
      .set('authorization', userAuthorization(otherUserId))
      .expect(403);

    const owner = await request(app.getHttpServer())
      .get(`/v1/credit-accounts/${ownerId}`)
      .set('authorization', userAuthorization(ownerId))
      .expect(200);
    expect(owner.body).toMatchObject({
      userId: ownerId,
      availableCredits: 100,
    });

    await request(app.getHttpServer())
      .get(`/v1/credit-accounts/${ownerId}`)
      .set('authorization', userAuthorization(otherUserId, true))
      .expect(200);
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
    expect(account).toMatchObject({
      availableCredits: 100,
      reservedCredits: 0,
    });
    expect(await prisma.creditReservation.count()).toBe(0);
  });

  it('returns 404 for missing accounts and reservations without side effects', async () => {
    const missingRequesterId = randomUUID();
    const missingErrandId = randomUUID();

    const reserve = await request(app.getHttpServer())
      .post('/v1/credit-reservations')
      .set('authorization', authorization)
      .send({
        errandId: randomUUID(),
        requesterId: missingRequesterId,
        amount: 10,
      })
      .expect(404);
    expect(reserve.body.code).toBe('ACCOUNT_NOT_FOUND');

    const settle = await request(app.getHttpServer())
      .post(`/v1/credit-reservations/${missingErrandId}/settlement`)
      .set('authorization', authorization)
      .send({
        requesterId: randomUUID(),
        courierId: randomUUID(),
        amount: 10,
      })
      .expect(404);
    expect(settle.body.code).toBe('RESERVATION_NOT_FOUND');
    expect(await prisma.creditReservation.count()).toBe(0);
    expect(await prisma.ledgerEntry.count()).toBe(0);
  });

  it('rolls back settlement when the courier account does not exist', async () => {
    const requesterId = await initialize();
    const errandId = randomUUID();
    await request(app.getHttpServer())
      .post('/v1/credit-reservations')
      .set('authorization', authorization)
      .send({ errandId, requesterId, amount: 20 })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post(`/v1/credit-reservations/${errandId}/settlement`)
      .set('authorization', authorization)
      .send({ requesterId, courierId: randomUUID(), amount: 20 })
      .expect(404);
    expect(response.body.code).toBe('ACCOUNT_NOT_FOUND');

    const account = await prisma.creditAccount.findUniqueOrThrow({
      where: { userId: requesterId },
    });
    const reservation = await prisma.creditReservation.findUniqueOrThrow({
      where: { errandId },
    });
    expect(account).toMatchObject({
      availableCredits: 80,
      reservedCredits: 20,
    });
    expect(reservation.status).toBe('RESERVED');
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

    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 422,
    ]);
    const account = await prisma.creditAccount.findUniqueOrThrow({
      where: { userId: requesterId },
    });
    expect(account).toMatchObject({
      availableCredits: 30,
      reservedCredits: 70,
    });
    expect(await prisma.creditReservation.count()).toBe(1);
  });

  it('reserves the exact available balance', async () => {
    const requesterId = await initialize();
    await request(app.getHttpServer())
      .post('/v1/credit-reservations')
      .set('authorization', authorization)
      .send({ errandId: randomUUID(), requesterId, amount: 100 })
      .expect(201);

    const account = await prisma.creditAccount.findUniqueOrThrow({
      where: { userId: requesterId },
    });
    expect(account).toMatchObject({
      availableCredits: 0,
      reservedCredits: 100,
    });
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

    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 201,
    ]);
    const account = await prisma.creditAccount.findUniqueOrThrow({
      where: { userId: requesterId },
    });
    expect(account).toMatchObject({
      availableCredits: 70,
      reservedCredits: 30,
    });
    expect(await prisma.creditReservation.count()).toBe(1);
  });

  it('rejects a duplicate errand reservation with changed data', async () => {
    const requesterId = await initialize();
    const errandId = randomUUID();
    await request(app.getHttpServer())
      .post('/v1/credit-reservations')
      .set('authorization', authorization)
      .send({ errandId, requesterId, amount: 30 })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/v1/credit-reservations')
      .set('authorization', authorization)
      .send({ errandId, requesterId, amount: 31 })
      .expect(409);
    expect(response.body.code).toBe('IDEMPOTENCY_CONFLICT');

    await expect(
      prisma.creditAccount.findUniqueOrThrow({ where: { userId: requesterId } }),
    ).resolves.toMatchObject({ availableCredits: 70, reservedCredits: 30 });
    await expect(
      prisma.creditReservation.findUniqueOrThrow({ where: { errandId } }),
    ).resolves.toMatchObject({ requesterId, amount: 30, status: 'RESERVED' });
    expect(
      await prisma.ledgerEntry.count({ where: { errandId, type: 'RESERVE' } }),
    ).toBe(1);
  });

  it('adjusts a reservation by delta and deduplicates adjustment retries', async () => {
    const requesterId = await initialize();
    const errandId = randomUUID();
    await request(app.getHttpServer())
      .post('/v1/credit-reservations')
      .set('authorization', authorization)
      .send({ errandId, requesterId, amount: 40 })
      .expect(201);

    const increase = {
      requesterId,
      targetAmount: 70,
      idempotencyKey: 'increase-bounty-1',
    };
    const first = await request(app.getHttpServer())
      .post(`/v1/credit-reservations/${errandId}/adjustment`)
      .set('authorization', authorization)
      .set('x-correlation-id', 'adjust-increase-correlation')
      .send(increase)
      .expect(200);
    const replay = await request(app.getHttpServer())
      .post(`/v1/credit-reservations/${errandId}/adjustment`)
      .set('authorization', authorization)
      .send(increase)
      .expect(200);
    expect(first.body).toMatchObject({
      replayed: false,
      reservation: { amount: 70 },
      requesterBalance: { availableCredits: 30, reservedCredits: 70 },
    });
    expect(replay.body.replayed).toBe(true);

    const conflictingReplay = await request(app.getHttpServer())
      .post(`/v1/credit-reservations/${errandId}/adjustment`)
      .set('authorization', authorization)
      .send({ ...increase, targetAmount: 60 })
      .expect(409);
    expect(conflictingReplay.body.code).toBe(
      'ADJUSTMENT_IDEMPOTENCY_CONFLICT',
    );

    const insufficient = await request(app.getHttpServer())
      .post(`/v1/credit-reservations/${errandId}/adjustment`)
      .set('authorization', authorization)
      .send({
        requesterId,
        targetAmount: 101,
        idempotencyKey: 'increase-bounty-insufficient',
      })
      .expect(422);
    expect(insufficient.body.code).toBe('INSUFFICIENT_CREDITS');
    await expect(
      prisma.creditReservation.findUniqueOrThrow({ where: { errandId } }),
    ).resolves.toMatchObject({ amount: 70 });

    await request(app.getHttpServer())
      .post(`/v1/credit-reservations/${errandId}/adjustment`)
      .set('authorization', authorization)
      .set('x-correlation-id', 'adjust-decrease-correlation')
      .send({
        requesterId,
        targetAmount: 25,
        idempotencyKey: 'decrease-bounty-1',
      })
      .expect(200);

    const account = await prisma.creditAccount.findUniqueOrThrow({
      where: { userId: requesterId },
    });
    const reservation = await prisma.creditReservation.findUniqueOrThrow({
      where: { errandId },
    });
    const activeReservations = await prisma.creditReservation.aggregate({
      where: { requesterId, status: 'RESERVED' },
      _sum: { amount: true },
    });
    expect(account).toMatchObject({
      availableCredits: 75,
      reservedCredits: 25,
    });
    expect(reservation.amount).toBe(25);
    expect(activeReservations._sum.amount).toBe(account.reservedCredits);
    expect(await prisma.creditReservationAdjustment.count()).toBe(2);
    expect(
      await prisma.ledgerEntry.findFirstOrThrow({
        where: { errandId, type: 'ADJUST_RESERVE' },
      }),
    ).toMatchObject({
      amount: 30,
      correlationId: 'adjust-increase-correlation',
    });
    expect(
      await prisma.ledgerEntry.findFirstOrThrow({
        where: { errandId, type: 'ADJUST_RELEASE' },
      }),
    ).toMatchObject({
      amount: 45,
      correlationId: 'adjust-decrease-correlation',
    });
  });

  it('settles once and replays a duplicate completion delivery', async () => {
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
        .send({ requesterId, courierId, amount: 35 }),
      request(app.getHttpServer())
        .post(`/v1/credit-reservations/${errandId}/settlement`)
        .set('authorization', authorization)
        .send({ requesterId, courierId, amount: 35 }),
    ]);
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(responses.filter((response) => response.body.replayed)).toHaveLength(
      1,
    );

    const requester = await prisma.creditAccount.findUniqueOrThrow({
      where: { userId: requesterId },
    });
    const courier = await prisma.creditAccount.findUniqueOrThrow({
      where: { userId: courierId },
    });
    expect(requester).toMatchObject({
      availableCredits: 65,
      reservedCredits: 0,
    });
    expect(courier).toMatchObject({
      availableCredits: 135,
      reservedCredits: 0,
    });
    expect(
      await prisma.ledgerEntry.count({
        where: { reservation: { errandId } },
      }),
    ).toBe(3);
  });

  it('rejects release after settlement without changing settled state', async () => {
    const requesterId = await initialize();
    const courierId = await initialize();
    const errandId = randomUUID();
    await request(app.getHttpServer())
      .post('/v1/credit-reservations')
      .set('authorization', authorization)
      .send({ errandId, requesterId, amount: 25 })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/v1/credit-reservations/${errandId}/settlement`)
      .set('authorization', authorization)
      .send({ requesterId, courierId, amount: 25 })
      .expect(200);

    const response = await request(app.getHttpServer())
      .post(`/v1/credit-reservations/${errandId}/release`)
      .set('authorization', authorization)
      .send({ requesterId, amount: 25 })
      .expect(409);
    expect(response.body.code).toBe('RESERVATION_STATE_CONFLICT');

    await expect(
      prisma.creditAccount.findUniqueOrThrow({ where: { userId: requesterId } }),
    ).resolves.toMatchObject({ availableCredits: 75, reservedCredits: 0 });
    await expect(
      prisma.creditAccount.findUniqueOrThrow({ where: { userId: courierId } }),
    ).resolves.toMatchObject({ availableCredits: 125, reservedCredits: 0 });
    await expect(
      prisma.creditReservation.findUniqueOrThrow({ where: { errandId } }),
    ).resolves.toMatchObject({ status: 'SETTLED', courierId });
    expect(
      await prisma.ledgerEntry.count({ where: { errandId, type: 'SETTLE' } }),
    ).toBe(2);
    expect(
      await prisma.ledgerEntry.count({ where: { errandId, type: 'RELEASE' } }),
    ).toBe(0);
  });

  it('survives commit-before-ACK redelivery of ErrandCompleted', async () => {
    const requesterId = await initialize();
    const courierId = await initialize();
    const errandId = randomUUID();
    await request(app.getHttpServer())
      .post('/v1/credit-reservations')
      .set('authorization', authorization)
      .send({ errandId, requesterId, amount: 35 })
      .expect(201);
    const event = {
      eventId: randomUUID(),
      eventType: ERRAND_COMPLETED_EVENT,
      data: { errandId, requesterId, courierId, amount: 35 },
    };

    await expect(events.handleErrandCompleted(event)).resolves.toMatchObject({
      replayed: false,
    });
    // The broker can safely redeliver when the first ACK was never observed.
    await expect(events.handleErrandCompleted(event)).resolves.toMatchObject({
      replayed: true,
    });

    await expect(
      prisma.creditAccount.findUniqueOrThrow({ where: { userId: courierId } }),
    ).resolves.toMatchObject({ availableCredits: 135 });
    expect(await prisma.processedEvent.count()).toBe(1);
    expect(
      await prisma.ledgerEntry.count({ where: { errandId, type: 'SETTLE' } }),
    ).toBe(2);
    await expect(
      prisma.outboxEvent.findMany({
        where: { eventType: 'credit.transferred.v1' },
      }),
    ).resolves.toMatchObject([{ published: false }]);
  });

  it('rolls back the processed marker when event handling fails', async () => {
    const event = {
      eventId: randomUUID(),
      eventType: ERRAND_COMPLETED_EVENT,
      data: {
        errandId: randomUUID(),
        requesterId: randomUUID(),
        courierId: randomUUID(),
        amount: 20,
      },
    };

    await expect(events.handleErrandCompleted(event)).rejects.toMatchObject({
      code: 'RESERVATION_NOT_FOUND',
    });
    expect(await prisma.processedEvent.count()).toBe(0);
    expect(await prisma.outboxEvent.count()).toBe(0);
  });

  it('rejects settlement when requester or expected amount does not match', async () => {
    const requesterId = await initialize();
    const courierId = await initialize();
    const errandId = randomUUID();
    await request(app.getHttpServer())
      .post('/v1/credit-reservations')
      .set('authorization', authorization)
      .send({ errandId, requesterId, amount: 20 })
      .expect(201);

    for (const body of [
      { requesterId: randomUUID(), courierId, amount: 20 },
      { requesterId, courierId, amount: 21 },
    ]) {
      const response = await request(app.getHttpServer())
        .post(`/v1/credit-reservations/${errandId}/settlement`)
        .set('authorization', authorization)
        .send(body)
        .expect(409);
      expect(response.body.code).toBe('IDEMPOTENCY_CONFLICT');
    }

    const requester = await prisma.creditAccount.findUniqueOrThrow({
      where: { userId: requesterId },
    });
    expect(requester).toMatchObject({
      availableCredits: 80,
      reservedCredits: 20,
    });
  });

  it('rejects settlement that would exceed the courier balance limit', async () => {
    const requesterId = await initialize();
    const courierId = await initialize();
    const errandId = randomUUID();
    await request(app.getHttpServer())
      .post('/v1/credit-reservations')
      .set('authorization', authorization)
      .send({ errandId, requesterId, amount: 20 })
      .expect(201);
    await prisma.creditAccount.update({
      where: { userId: courierId },
      data: { availableCredits: MAX_CREDIT_BALANCE - 10 },
    });

    const response = await request(app.getHttpServer())
      .post(`/v1/credit-reservations/${errandId}/settlement`)
      .set('authorization', authorization)
      .send({ requesterId, courierId, amount: 20 })
      .expect(409);
    expect(response.body.code).toBe('ACCOUNT_BALANCE_LIMIT_EXCEEDED');

    await expect(
      prisma.creditAccount.findUniqueOrThrow({ where: { userId: requesterId } }),
    ).resolves.toMatchObject({ availableCredits: 80, reservedCredits: 20 });
    await expect(
      prisma.creditAccount.findUniqueOrThrow({ where: { userId: courierId } }),
    ).resolves.toMatchObject({ availableCredits: MAX_CREDIT_BALANCE - 10 });
    await expect(
      prisma.creditReservation.findUniqueOrThrow({ where: { errandId } }),
    ).resolves.toMatchObject({ status: 'RESERVED' });
    await expect(
      prisma.creditAccount.update({
        where: { userId: courierId },
        data: { availableCredits: MAX_CREDIT_BALANCE + 1 },
      }),
    ).rejects.toThrow();

    await request(app.getHttpServer()).get('/metrics').expect(401);
    const metrics = await request(app.getHttpServer())
      .get('/metrics')
      .set('authorization', monitoringAuthorization)
      .expect(200)
      .expect('content-type', /text\/plain/);
    expect(metrics.text).toContain(
      'credit_operation_conflicts_total{operation="settle",type="account_balance_limit_exceeded"} 1',
    );
    expect(metrics.text).toContain(
      'credit_transaction_failures_total{operation="settle",cause="account_balance_limit_exceeded"} 1',
    );
  });

  it('preserves committed balances after reconnecting to PostgreSQL', async () => {
    const requesterId = await initialize();
    const errandId = randomUUID();
    await request(app.getHttpServer())
      .post('/v1/credit-reservations')
      .set('authorization', authorization)
      .send({ errandId, requesterId, amount: 20 })
      .expect(201);

    await prisma.$disconnect();
    await prisma.$connect();

    await expect(
      prisma.creditAccount.findUniqueOrThrow({ where: { userId: requesterId } }),
    ).resolves.toMatchObject({ availableCredits: 80, reservedCredits: 20 });
    await expect(
      prisma.creditReservation.findUniqueOrThrow({ where: { errandId } }),
    ).resolves.toMatchObject({ amount: 20, status: 'RESERVED' });
  });

  it('rejects self-settlement without moving reserved funds', async () => {
    const requesterId = await initialize();
    const errandId = randomUUID();
    await request(app.getHttpServer())
      .post('/v1/credit-reservations')
      .set('authorization', authorization)
      .send({ errandId, requesterId, amount: 25 })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post(`/v1/credit-reservations/${errandId}/settlement`)
      .set('authorization', authorization)
      .send({ requesterId, courierId: requesterId, amount: 25 })
      .expect(409);
    expect(response.body.code).toBe('SELF_SETTLEMENT_FORBIDDEN');

    await expect(
      prisma.creditReservation.update({
        where: { errandId },
        data: {
          courierId: requesterId,
          settledAt: new Date(),
          status: 'SETTLED',
        },
      }),
    ).rejects.toThrow();

    const account = await prisma.creditAccount.findUniqueOrThrow({
      where: { userId: requesterId },
    });
    const reservation = await prisma.creditReservation.findUniqueOrThrow({
      where: { errandId },
    });
    expect(account).toMatchObject({
      availableCredits: 75,
      reservedCredits: 25,
    });
    expect(reservation).toMatchObject({ status: 'RESERVED', courierId: null });
  });

  it('releases once, replays duplicate release, and rejects later settlement', async () => {
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
      .send({ requesterId, amount: 45 })
      .expect(200);
    const retry = await request(app.getHttpServer())
      .post(`/v1/credit-reservations/${errandId}/release`)
      .set('authorization', authorization)
      .send({ requesterId, amount: 45 })
      .expect(200);
    expect(first.body.replayed).toBe(false);
    expect(retry.body.replayed).toBe(true);

    await request(app.getHttpServer())
      .post(`/v1/credit-reservations/${errandId}/settlement`)
      .set('authorization', authorization)
      .send({ requesterId, courierId, amount: 45 })
      .expect(409);
    const requester = await prisma.creditAccount.findUniqueOrThrow({
      where: { userId: requesterId },
    });
    expect(requester).toMatchObject({
      availableCredits: 100,
      reservedCredits: 0,
    });
  });

  it('allows only one terminal result when settlement races release', async () => {
    const requesterId = await initialize();
    const courierId = await initialize();
    const errandId = randomUUID();
    await request(app.getHttpServer())
      .post('/v1/credit-reservations')
      .set('authorization', authorization)
      .send({ errandId, requesterId, amount: 30 })
      .expect(201);

    const [settlement, release] = await Promise.all([
      request(app.getHttpServer())
        .post(`/v1/credit-reservations/${errandId}/settlement`)
        .set('authorization', authorization)
        .send({ requesterId, courierId, amount: 30 }),
      request(app.getHttpServer())
        .post(`/v1/credit-reservations/${errandId}/release`)
        .set('authorization', authorization)
        .send({ requesterId, amount: 30 }),
    ]);
    expect([settlement.status, release.status].sort()).toEqual([200, 409]);

    const requester = await prisma.creditAccount.findUniqueOrThrow({
      where: { userId: requesterId },
    });
    const courier = await prisma.creditAccount.findUniqueOrThrow({
      where: { userId: courierId },
    });
    const reservation = await prisma.creditReservation.findUniqueOrThrow({
      where: { errandId },
    });
    expect(requester.reservedCredits).toBe(0);
    expect(requester.availableCredits + courier.availableCredits).toBe(200);
    expect(['SETTLED', 'RELEASED']).toContain(reservation.status);
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
    const ledgerCount = await prisma.ledgerEntry.count();

    await request(app.getHttpServer())
      .post('/v1/credit-reservations')
      .send({ errandId: randomUUID(), requesterId, amount: 10 })
      .expect(401);
    await request(app.getHttpServer())
      .post(`/v1/credit-reservations/${errandId}/settlement`)
      .set('authorization', 'Bearer unauthorized-service-token')
      .send({ requesterId, courierId, amount: 20 })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/v1/credit-reservations/${errandId}/release`)
      .send({ requesterId, amount: 20 })
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
    expect(requester).toMatchObject({
      availableCredits: 80,
      reservedCredits: 20,
    });
    expect(courier).toMatchObject({
      availableCredits: 100,
      reservedCredits: 0,
    });
    expect(reservation.status).toBe('RESERVED');
    expect(await prisma.creditReservation.count()).toBe(1);
    expect(await prisma.ledgerEntry.count()).toBe(ledgerCount);
  });

  it('enforces least-privilege internal caller credentials', async () => {
    const userId = randomUUID();
    await request(app.getHttpServer())
      .post('/v1/credit-accounts')
      .set('authorization', authorization)
      .send({ userId })
      .expect(403);

    await request(app.getHttpServer())
      .post('/v1/credit-accounts')
      .set('authorization', userServiceAuthorization)
      .send({ userId })
      .expect(201);

    await request(app.getHttpServer())
      .post('/v1/credit-reservations')
      .set('authorization', userServiceAuthorization)
      .send({ errandId: randomUUID(), requesterId: userId, amount: 10 })
      .expect(403);

    await request(app.getHttpServer())
      .get('/metrics')
      .set('authorization', authorization)
      .expect(403);
  });

  it('rejects a student JWT on every credit mutation', async () => {
    const studentId = await initialize();
    const courierId = await initialize();
    const errandId = randomUUID();
    const studentJwt = userAuthorization(studentId);

    const attacks = [];
    attacks.push(
      await request(app.getHttpServer())
        .post('/v1/credit-accounts')
        .set('authorization', studentJwt)
        .send({ userId: studentId }),
    );
    attacks.push(
      await request(app.getHttpServer())
        .post('/v1/credit-reservations')
        .set('authorization', studentJwt)
        .send({ errandId, requesterId: studentId, amount: 10 }),
    );
    attacks.push(
      await request(app.getHttpServer())
        .post(`/v1/credit-reservations/${errandId}/adjustment`)
        .set('authorization', studentJwt)
        .send({
          requesterId: studentId,
          targetAmount: 100,
          idempotencyKey: 'student-credit-increase',
        }),
    );
    attacks.push(
      await request(app.getHttpServer())
        .post(`/v1/credit-reservations/${errandId}/settlement`)
        .set('authorization', studentJwt)
        .send({ requesterId: studentId, courierId, amount: 10 }),
    );
    attacks.push(
      await request(app.getHttpServer())
        .post(`/v1/credit-reservations/${errandId}/release`)
        .set('authorization', studentJwt)
        .send({ requesterId: studentId, amount: 10 }),
    );
    expect(attacks.map(({ status }) => status)).toEqual([
      403, 403, 403, 403, 403,
    ]);

    await expect(
      prisma.creditAccount.findUniqueOrThrow({ where: { userId: studentId } }),
    ).resolves.toMatchObject({ availableCredits: 100, reservedCredits: 0 });
    expect(await prisma.creditReservation.count()).toBe(0);
  });

  it('creates indexes for identity, status, foreign-key, and history lookups', async () => {
    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('credit_accounts', 'credit_reservations', 'ledger_entries')
    `;
    const names = indexes.map(({ indexname }) => indexname);

    expect(names).toEqual(
      expect.arrayContaining([
        'credit_accounts_pkey',
        'credit_reservations_errand_id_key',
        'credit_reservations_requester_id_idx',
        'credit_reservations_courier_id_idx',
        'credit_reservations_status_updated_at_idx',
        'ledger_entries_account_user_id_created_at_idx',
        'ledger_entries_reservation_id_idx',
        'ledger_entries_created_at_idx',
        'ledger_entries_errand_id_idx',
      ]),
    );
  });

  it('keeps ledger entries immutable and linked to their errand', async () => {
    const requesterId = await initialize();
    const errandId = randomUUID();
    await request(app.getHttpServer())
      .post('/v1/credit-reservations')
      .set('authorization', authorization)
      .send({ errandId, requesterId, amount: 20 })
      .expect(201);

    const entry = await prisma.ledgerEntry.findFirstOrThrow({
      where: { errandId, type: 'RESERVE' },
    });
    expect(entry.reservationId).not.toBeNull();
    expect(entry.correlationId).toBeTruthy();

    await expect(
      prisma.ledgerEntry.update({
        where: { ledgerEntryId: entry.ledgerEntryId },
        data: { amount: 21 },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.ledgerEntry.delete({
        where: { ledgerEntryId: entry.ledgerEntryId },
      }),
    ).rejects.toThrow();
  });
});
