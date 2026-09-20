import type { OnModuleDestroy } from '@nestjs/common';
import { Queue, type JobsOptions } from 'bullmq';

import type {
  VerificationEmailDeliveryPort,
  VerificationEmailMessage,
} from '../../application/ports/verification-email-delivery.port.js';

export const VERIFICATION_EMAIL_QUEUE_NAME = 'verification-email';
export const SEND_VERIFICATION_EMAIL_JOB = 'send-verification-email';

export interface VerificationEmailJobData {
  code: string;
  expiresAt: string;
  recipientEmail: string;
  verificationId: string;
}

export interface VerificationEmailQueue {
  add(
    name: string,
    data: VerificationEmailJobData,
    options: JobsOptions,
  ): Promise<unknown>;
  close(): Promise<void>;
}

export class BullMqVerificationEmailDelivery
  implements VerificationEmailDeliveryPort, OnModuleDestroy
{
  private readonly queue: VerificationEmailQueue;

  constructor(redisUrl: string, queue?: VerificationEmailQueue) {
    this.queue =
      queue ??
      new Queue<VerificationEmailJobData>(VERIFICATION_EMAIL_QUEUE_NAME, {
        connection: { url: redisUrl },
      });
  }

  async enqueue(message: VerificationEmailMessage): Promise<void> {
    await this.queue.add(
      SEND_VERIFICATION_EMAIL_JOB,
      {
        ...message,
        expiresAt: message.expiresAt.toISOString(),
      },
      {
        attempts: 5,
        backoff: { delay: 5_000, type: 'exponential' },
        jobId: message.verificationId,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
