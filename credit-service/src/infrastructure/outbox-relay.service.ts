import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  connect,
  type ChannelModel,
  type ConfirmChannel,
} from 'amqplib';
import { PrismaService } from './prisma.service';

@Injectable()
export class OutboxRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name);
  private readonly enabled: boolean;
  private readonly exchange: string;
  private readonly pollIntervalMs: number;
  private readonly rabbitmqUrl: string;
  private connection?: ChannelModel;
  private channel?: ConfirmChannel;
  private timer?: NodeJS.Timeout;
  private publishing = false;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.enabled = config.getOrThrow<boolean>('messaging.enabled');
    this.exchange = config.getOrThrow<string>('messaging.exchange');
    this.pollIntervalMs = config.getOrThrow<number>(
      'messaging.outboxPollIntervalMs',
    );
    this.rabbitmqUrl = config.getOrThrow<string>('messaging.rabbitmqUrl');
  }

  onModuleInit(): void {
    if (!this.enabled) return;
    this.timer = setInterval(() => void this.publishPending(), this.pollIntervalMs);
    this.timer.unref();
    void this.publishPending();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }

  async publishPending(): Promise<void> {
    if (!this.enabled || this.publishing) return;
    this.publishing = true;
    try {
      const events = await this.prisma.outboxEvent.findMany({
        where: { published: false },
        orderBy: { createdAt: 'asc' },
        take: 50,
      });
      if (events.length === 0) return;

      const channel = await this.requireChannel();
      for (const event of events) {
        await new Promise<void>((resolve, reject) => {
          channel.publish(
            this.exchange,
            event.eventType,
            Buffer.from(
              JSON.stringify({
                pattern: event.eventType,
                data: {
                  eventId: event.id,
                  eventType: event.eventType,
                  data: event.payload,
                },
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
            (error) => (error ? reject(error) : resolve()),
          );
        });
        await this.prisma.outboxEvent.updateMany({
          where: { id: event.id, published: false },
          data: { published: true },
        });
      }
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Outbox publish failed; unpublished events will be retried',
      );
      await this.resetConnection();
    } finally {
      this.publishing = false;
    }
  }

  private async requireChannel(): Promise<ConfirmChannel> {
    if (this.channel) return this.channel;
    this.connection = await connect(this.rabbitmqUrl);
    this.connection.on('close', () => {
      this.connection = undefined;
      this.channel = undefined;
    });
    this.connection.on('error', () => undefined);
    this.channel = await this.connection.createConfirmChannel();
    await this.channel.assertExchange(this.exchange, 'topic', { durable: true });
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
