import {
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Worker, type Job } from 'bullmq';

import type { VerificationEmailSenderPort } from '../../application/ports/verification-email-delivery.port.js';
import {
  SEND_VERIFICATION_EMAIL_JOB,
  VERIFICATION_EMAIL_QUEUE_NAME,
  type VerificationEmailJobData,
} from './verification-email.queue.js';

export class VerificationEmailProcessor {
  constructor(private readonly sender: VerificationEmailSenderPort) {}

  async process(data: VerificationEmailJobData): Promise<void> {
    await this.sender.send({
      ...data,
      expiresAt: new Date(data.expiresAt),
    });
  }
}

export class VerificationEmailWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VerificationEmailWorker.name);
  private worker?: Worker<VerificationEmailJobData>;

  constructor(
    private readonly redisUrl: string,
    private readonly processor: VerificationEmailProcessor,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<VerificationEmailJobData>(
      VERIFICATION_EMAIL_QUEUE_NAME,
      async (job: Job<VerificationEmailJobData>): Promise<void> => {
        if (job.name !== SEND_VERIFICATION_EMAIL_JOB) {
          throw new Error(`Unsupported verification email job: ${job.name}`);
        }

        await this.processor.process(job.data);
      },
      { connection: { url: this.redisUrl } },
    );
    this.worker.on('error', (error: Error) => {
      this.logger.error(`Verification email worker error: ${error.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
