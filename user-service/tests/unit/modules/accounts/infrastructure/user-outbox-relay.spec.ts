import type { ConfigService } from '@nestjs/config';
import type { ChannelModel, ConfirmChannel } from 'amqplib';

import {
  type RabbitMqConnector,
  UserOutboxRelayService,
} from '../../../../../src/modules/accounts/infrastructure/messaging/user-outbox-relay.service.js';
import type { EnvironmentVariables } from '../../../../../src/platform/config/environment.schema.js';
import type { PrismaService } from '../../../../../src/platform/database/prisma.service.js';

const EVENT_ID = '44190d22-9ee2-4655-b236-451afb0cb225';
const USER_ID = '4a84f480-b1cb-4b81-b632-8bb49034b9e7';
const CREATED_AT = new Date('2026-10-17T02:00:00.000Z');

describe('UserOutboxRelayService', () => {
  it('publishes the Credit Service envelope and marks the row after confirmation', async () => {
    const publications: Array<{
      content: Buffer;
      exchange: string;
      routingKey: string;
    }> = [];
    const updates: unknown[] = [];
    const channel = {
      assertExchange: () => Promise.resolve({ exchange: 'foc.events' }),
      close: () => Promise.resolve(),
      publish: (
        exchange: string,
        routingKey: string,
        content: Buffer,
        _options: unknown,
        callback: (error: Error | null) => void,
      ) => {
        publications.push({ content, exchange, routingKey });
        callback(null);
        return true;
      },
    } as unknown as ConfirmChannel;
    const connection = {
      close: () => Promise.resolve(),
      createConfirmChannel: () => Promise.resolve(channel),
      on: () => connection,
    } as unknown as ChannelModel;
    const connectRabbitMq: RabbitMqConnector = () =>
      Promise.resolve(connection);
    const prisma = {
      outboxEvent: {
        findMany: () =>
          Promise.resolve([
            {
              aggregateId: USER_ID,
              aggregateType: 'user',
              createdAt: CREATED_AT,
              eventType: 'user.verified.v1',
              id: EVENT_ID,
              payload: { userId: USER_ID },
              published: false,
            },
          ]),
        updateMany: (input: unknown) => {
          updates.push(input);
          return Promise.resolve({ count: 1 });
        },
      },
    } as unknown as PrismaService;
    const relay = new UserOutboxRelayService(
      prisma,
      config(true),
      connectRabbitMq,
    );

    await relay.publishPending();

    expect(publications).toHaveLength(1);
    expect(publications[0]).toMatchObject({
      exchange: 'foc.events',
      routingKey: 'user.verified.v1',
    });
    expect(JSON.parse(publications[0]!.content.toString('utf8'))).toEqual({
      data: {
        data: { userId: USER_ID },
        eventId: EVENT_ID,
        eventType: 'user.verified.v1',
      },
      pattern: 'user.verified.v1',
    });
    expect(updates).toEqual([
      {
        data: { published: true },
        where: { id: EVENT_ID, published: false },
      },
    ]);
    await relay.onModuleDestroy();
  });

  it('does not query PostgreSQL while event delivery is disabled', async () => {
    let queried = false;
    const prisma = {
      outboxEvent: {
        findMany: () => {
          queried = true;
          return Promise.resolve([]);
        },
      },
    } as unknown as PrismaService;
    const relay = new UserOutboxRelayService(prisma, config(false));

    await relay.publishPending();

    expect(queried).toBe(false);
  });
});

function config(enabled: boolean): ConfigService<EnvironmentVariables, true> {
  const values: Pick<
    EnvironmentVariables,
    | 'RABBITMQ_URL'
    | 'USER_EVENTS_ENABLED'
    | 'USER_EVENTS_EXCHANGE'
    | 'USER_OUTBOX_POLL_INTERVAL_MS'
  > = {
    RABBITMQ_URL: 'amqp://localhost:5672',
    USER_EVENTS_ENABLED: enabled,
    USER_EVENTS_EXCHANGE: 'foc.events',
    USER_OUTBOX_POLL_INTERVAL_MS: 1000,
  };
  return {
    get: (key: keyof typeof values) => values[key],
  } as unknown as ConfigService<EnvironmentVariables, true>;
}
