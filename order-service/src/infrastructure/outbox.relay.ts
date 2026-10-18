import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, type ChannelModel, type ConfirmChannel } from 'amqplib';
import { PrismaService } from './prisma.service';

export const DEFAULT_RABBITMQ_URL =
  'amqp://foc:foc_local_password@127.0.0.1:5672';

/**
 * Publishes outbox rows to RabbitMQ in credit-service's envelope (docs/events.md §2).
 * A row is marked published only after the broker confirms it, so a crash can at
 * worst republish the same eventId, which credit deduplicates. Disabled unless
 * ORDER_EVENTS_ENABLED=true; rows keep accumulating safely while it is off.
 */
@Injectable()
export class OutboxRelay implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelay.name);
  private readonly enabled: boolean;
  private readonly exchange: string;
  private readonly url: string;
  private connection?: ChannelModel;
  private channel?: ConfirmChannel;
  private timer?: ReturnType<typeof setInterval>;
  private publishing = false;
  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.enabled = config.get<string>('ORDER_EVENTS_ENABLED') === 'true';
    this.exchange = config.get<string>('ORDER_EVENTS_EXCHANGE') ?? 'foc.events';
    this.url = config.get<string>('RABBITMQ_URL') ?? DEFAULT_RABBITMQ_URL;
  }
  onModuleInit() {
    if (!this.enabled) return;
    this.timer = setInterval(() => void this.publishPending(), 1000);
    this.timer.unref();
    void this.publishPending();
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.reset();
  }
  /** Publishes up to 50 pending rows, oldest first; returns how many were confirmed. */
  async publishPending() {
    if (this.publishing) return 0;
    this.publishing = true;
    let published = 0;
    try {
      const events = await this.prisma.outboxEvent.findMany({
        where: { publishedAt: null },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 50,
      });
      if (events.length === 0) return 0;
      const channel = await this.requireChannel();
      for (const event of events) {
        const body = {
          pattern: event.eventType,
          data: {
            eventId: event.id,
            eventType: event.eventType,
            data: event.payload,
          },
        };
        await new Promise<void>((resolve, reject) =>
          channel.publish(
            this.exchange,
            event.eventType,
            Buffer.from(JSON.stringify(body), 'utf8'),
            {
              contentType: 'application/json',
              deliveryMode: 2,
              messageId: event.id,
              timestamp: event.createdAt.getTime(),
              type: event.eventType,
              headers: event.headers as Record<string, string>,
            },
            (error) => (error ? reject(error as Error) : resolve()),
          ),
        );
        await this.prisma.outboxEvent.updateMany({
          where: { id: event.id, publishedAt: null },
          data: { publishedAt: new Date() },
        });
        published++;
      }
    } catch (error) {
      this.logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Outbox publish failed; unpublished events will be retried',
      );
      await this.reset();
    } finally {
      this.publishing = false;
    }
    return published;
  }
  /** Seam for tests; production connects with amqplib. */
  protected open(url: string): Promise<ChannelModel> {
    return connect(url);
  }
  private async requireChannel() {
    if (this.channel) return this.channel;
    const connection = await this.open(this.url);
    this.connection = connection;
    connection.on('close', () => {
      this.connection = undefined;
      this.channel = undefined;
    });
    connection.on('error', () => undefined);
    this.channel = await connection.createConfirmChannel();
    await this.channel.assertExchange(this.exchange, 'topic', {
      durable: true,
    });
    return this.channel;
  }
  private async reset() {
    const { channel, connection } = this;
    this.channel = undefined;
    this.connection = undefined;
    await channel?.close().catch(() => undefined);
    await connection?.close().catch(() => undefined);
  }
}
