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
export type TimerName = 'auto-complete' | 'reopen';
export function timerJob(name: TimerName, errandId: string) {
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
 * Lifecycle timers: 4 h auto-complete (D-008) and 30-minute reopen (D-017). Postgres
 * timestamps are the truth: a sweeper finds due errands and enqueues one job per
 * errand (jobId dedupes across replicas); the job's conditional UPDATE re-checks the
 * deadline, so a lost Redis or a duplicate job only delays a transition, never
 * repeats it.
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
    const run: Record<TimerName, (errandId: string) => Promise<boolean>> = {
      'auto-complete': (errandId) => this.service.autoComplete(errandId),
      reopen: (errandId) => this.service.reopen(errandId),
    };
    this.worker = new Worker(
      'order-timers',
      (job) =>
        withCorrelationId(randomUUID(), () =>
          run[job.name as TimerName](String(job.data.errandId)),
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
      const due: [TimerName, string[]][] = [
        ['auto-complete', await this.repository.dueAutoCompletions()],
        ['reopen', await this.repository.dueReopens()],
      ];
      for (const [name, errandIds] of due)
        for (const errandId of errandIds) {
          const job = timerJob(name, errandId);
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
