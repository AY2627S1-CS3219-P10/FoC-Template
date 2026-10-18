import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { ORDER_REPOSITORY } from '../application/ports';
import type { OrderRepository } from '../application/ports';
import { OrderService } from '../application/order.service';
import { withCorrelationId } from './correlation';

/**
 * One BullMQ job per errand and timer. BullMQ rejects custom ids with a single ':'
 * (it reserves them for repeatable jobs), so the parts are joined with '-'.
 */
export function timerJob(name: 'auto-complete', errandId: string) {
  return {
    name,
    data: { errandId },
    opts: {
      jobId: `${name}-${errandId}`,
      attempts: 5,
      backoff: { type: 'exponential' as const, delay: 5000 },
      removeOnComplete: true,
      removeOnFail: true,
    },
  };
}

/**
 * Lifecycle timers (D-008). Postgres `delivered_at` is the truth: a sweeper finds due
 * errands and enqueues one job per errand (jobId dedupes across replicas); the job's
 * conditional UPDATE re-checks the deadline, so a lost Redis or a duplicate job only
 * delays completion, never repeats it.
 */
@Injectable()
export class TimerWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TimerWorker.name);
  private queue?: Queue;
  private worker?: Worker;
  private interval?: ReturnType<typeof setInterval>;
  private sweeping = false;
  constructor(
    private readonly config: ConfigService,
    private readonly service: OrderService,
    @Inject(ORDER_REPOSITORY) private readonly repository: OrderRepository,
  ) {}
  onModuleInit() {
    const connection = { url: this.config.getOrThrow<string>('REDIS_URL') };
    this.queue = new Queue('order-timers', { connection });
    this.worker = new Worker(
      'order-timers',
      (job) =>
        withCorrelationId(randomUUID(), () =>
          this.service.autoComplete(String(job.data.errandId)),
        ),
      { connection, concurrency: 4 },
    );
    const errorHandler = () =>
      this.logger.warn(
        'Lifecycle timers are temporarily unavailable. PostgreSQL retains the deadlines.',
      );
    this.queue.on('error', errorHandler);
    this.worker.on('error', errorHandler);
    this.interval = setInterval(() => void this.sweep(), 30000);
    void this.sweep();
  }
  private async sweep() {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      for (const errandId of await this.repository.dueAutoCompletions()) {
        const job = timerJob('auto-complete', errandId);
        await this.queue!.add(job.name, job.data, job.opts);
      }
    } catch {
      this.logger.warn('Lifecycle timer sweep will retry.');
    } finally {
      this.sweeping = false;
    }
  }
  async onModuleDestroy() {
    if (this.interval) clearInterval(this.interval);
    await this.worker?.close();
    await this.queue?.close();
  }
}
