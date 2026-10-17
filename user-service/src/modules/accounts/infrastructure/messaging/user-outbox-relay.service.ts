import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, type ChannelModel, type ConfirmChannel } from 'amqplib';

import type { EnvironmentVariables } from '../../../../platform/config/environment.schema.js';
import { PrismaService } from '../../../../platform/database/prisma.service.js';

export type RabbitMqConnector = (url: string) => Promise<ChannelModel>;

@Injectable()
export class UserOutboxRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UserOutboxRelayService.name);
  private readonly enabled: boolean;
  private readonly exchange: string;
  private readonly pollIntervalMs: number;
  private readonly rabbitmqUrl: string;
  private channel?: ConfirmChannel;
  private connection?: ChannelModel;
  private publishing = false;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<EnvironmentVariables, true>,
    private readonly connectRabbitMq: RabbitMqConnector = connect,
  ) {
    this.enabled = config.get('USER_EVENTS_ENABLED', { infer: true });
    this.exchange = config.get('USER_EVENTS_EXCHANGE', { infer: true });
    this.pollIntervalMs = config.get('USER_OUTBOX_POLL_INTERVAL_MS', {
      infer: true,
    });
    this.rabbitmqUrl = config.get('RABBITMQ_URL', { infer: true });
  }

  onModuleInit(): void {
    if (!this.enabled) {
      return;
    }

    this.timer = setInterval(
      () => void this.publishPending(),
      this.pollIntervalMs,
    );
    this.timer.unref();
    void this.publishPending();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
    }
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }

  async publishPending(): Promise<void> {
    if (!this.enabled || this.publishing) {
      return;
    }

    this.publishing = true;
    try {
      const events = await this.prisma.outboxEvent.findMany({
        orderBy: { createdAt: 'asc' },
        take: 50,
        where: { published: false },
      });
      if (events.length === 0) {
        return;
      }

      const channel = await this.requireChannel();
      for (const event of events) {
        await new Promise<void>((resolve, reject) => {
          channel.publish(
            this.exchange,
            event.eventType,
            Buffer.from(
              JSON.stringify({
                data: {
                  data: event.payload,
                  eventId: event.id,
                  eventType: event.eventType,
                },
                pattern: event.eventType,
              }),
              'utf8',
            ),
            {
              contentType: 'application/json',
              deliveryMode: 2,
              messageId: event.id,
              timestamp: event.createdAt.getTime(),
              type: event.eventType,
            },
            (error) =>
              error
                ? reject(
                    error instanceof Error
                      ? error
                      : new Error('RabbitMQ publisher confirmation failed.'),
                  )
                : resolve(),
          );
        });
        await this.prisma.outboxEvent.updateMany({
          data: { published: true },
          where: { id: event.id, published: false },
        });
      }
    } catch (error: unknown) {
      this.logger.error(
        {
          category:
            error instanceof Error ? error.name : 'UnknownOutboxRelayError',
        },
        'User outbox publish failed; unpublished events will be retried.',
      );
      await this.resetConnection();
    } finally {
      this.publishing = false;
    }
  }

  private async requireChannel(): Promise<ConfirmChannel> {
    if (this.channel) {
      return this.channel;
    }

    this.connection = await this.connectRabbitMq(this.rabbitmqUrl);
    this.connection.on('close', () => {
      this.connection = undefined;
      this.channel = undefined;
    });
    this.connection.on('error', () => undefined);
    this.channel = await this.connection.createConfirmChannel();
    await this.channel.assertExchange(this.exchange, 'topic', {
      durable: true,
    });
    return this.channel;
  }

  private async resetConnection(): Promise<void> {
    const channel = this.channel;
    const connection = this.connection;
    this.channel = undefined;
    this.connection = undefined;
    await channel?.close().catch(() => undefined);
    await connection?.close().catch(() => undefined);
  }
}
