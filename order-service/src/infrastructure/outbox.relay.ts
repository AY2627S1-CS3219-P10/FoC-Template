import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  connect,
  type ChannelModel,
  type ConfirmChannel,
  type Message,
} from 'amqplib';
import { PrismaService } from './prisma.service';

export const DEFAULT_RABBITMQ_URL =
  'amqp://foc:foc_local_password@127.0.0.1:5672';

/**
 * Publishes outbox rows to RabbitMQ in credit-service's envelope (docs/events.md §2).
 * A row is marked published only after the broker confirms it, so a crash can at
 * worst republish the same eventId, which credit deduplicates. Messages are published
 * `mandatory`: if no queue is bound yet (credit's consumer is off, or RabbitMQ lost its
 * queues on restart) the broker returns them and the row stays pending instead of being
 * dropped. Enabled unless ORDER_EVENTS_ENABLED=false; rows keep accumulating while off.
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
  /** messageIds the broker returned as unroutable, consumed after each confirm. */
  private readonly returned = new Set<string>();
  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.enabled = config.get<string>('ORDER_EVENTS_ENABLED') !== 'false';
    this.exchange = config.get<string>('ORDER_EVENTS_EXCHANGE') ?? 'foc.events';
    this.url = config.get<string>('RABBITMQ_URL') ?? DEFAULT_RABBITMQ_URL;
  }
  onModuleInit() {
    if (!this.enabled) {
      this.logger.warn(
        'ORDER_EVENTS_ENABLED=false: errand.completed.v1 stays in the outbox, so couriers are not paid until the relay is enabled',
      );
      return;
    }
    this.logger.log(
      { exchange: this.exchange },
      'Outbox relay started; publishing to RabbitMQ',
    );
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
              mandatory: true,
              messageId: event.id,
              timestamp: event.createdAt.getTime(),
              type: event.eventType,
              headers: event.headers as Record<string, string>,
            },
            (error) => (error ? reject(error as Error) : resolve()),
          ),
        );
        // RabbitMQ sends basic.return before the confirm, so the set is filled by now.
        if (this.returned.delete(event.id)) {
          this.logger.warn(
            {
              eventId: event.id,
              eventType: event.eventType,
              exchange: this.exchange,
            },
            'No queue is bound for this event (is credit-service consuming?); it stays pending and will be retried',
          );
          break;
        }
        await this.prisma.outboxEvent.updateMany({
          where: { id: event.id, publishedAt: null },
          data: { publishedAt: new Date() },
        });
        published++;
        this.logger.log(
          {
            eventId: event.id,
            eventType: event.eventType,
            errandId: event.aggregateId,
          },
          'Published outbox event',
        );
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
    this.channel.on('return', (message: Message) => {
      const id: unknown = message.properties.messageId;
      if (typeof id === 'string') this.returned.add(id);
    });
    await this.channel.assertExchange(this.exchange, 'topic', {
      durable: true,
    });
    return this.channel;
  }
  private async reset() {
    const { channel, connection } = this;
    this.channel = undefined;
    this.connection = undefined;
    this.returned.clear();
    await channel?.close().catch(() => undefined);
    await connection?.close().catch(() => undefined);
  }
}
