import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import { ORDER_REPOSITORY } from '../application/ports';
import type { OrderRepository } from '../application/ports';
import { OrderService } from '../application/order.service';
@Injectable()
export class RecoveryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RecoveryWorker.name);
  private queue?: Queue;
  private worker?: Worker;
  private interval?: ReturnType<typeof setInterval>;
  private dispatching = false;
  constructor(
    private readonly config: ConfigService,
    private readonly service: OrderService,
    @Inject(ORDER_REPOSITORY) private readonly repository: OrderRepository,
  ) {}
  onModuleInit() {
    const connection = { url: this.config.getOrThrow<string>('REDIS_URL') };
    this.queue = new Queue('order-operations', { connection });
    this.worker = new Worker(
      'order-operations',
      async (job) => {
        const result = await this.service.process(job.id!);
        if (result.status === 'PENDING')
          throw new Error(
            'Required service is unavailable; retry the persisted operation',
          );
      },
      { connection, concurrency: 4 },
    );
    const errorHandler = () =>
      this.logger.warn(
        'Order operation recovery is temporarily unavailable. PostgreSQL retains pending work.',
      );
    this.queue.on('error', errorHandler);
    this.worker.on('error', errorHandler);
    this.interval = setInterval(() => void this.dispatch(), 5000);
    void this.dispatch();
  }
  private async dispatch() {
    if (this.dispatching) return;
    this.dispatching = true;
    try {
      for (const id of await this.repository.pending())
        await this.queue!.add(
          'resume',
          {},
          {
            jobId: id,
            attempts: 5,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: true,
            removeOnFail: true,
          },
        );
    } catch {
      this.logger.warn('Pending operation dispatch will retry.');
    } finally {
      this.dispatching = false;
    }
  }
  async onModuleDestroy() {
    if (this.interval) clearInterval(this.interval);
    await this.worker?.close();
    await this.queue?.close();
  }
}
