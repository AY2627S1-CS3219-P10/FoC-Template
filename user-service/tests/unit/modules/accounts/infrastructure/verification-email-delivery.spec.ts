import type { VerificationEmailMessage } from '../../../../../src/modules/accounts/application/ports/verification-email-delivery.port.js';
import {
  type MailTransport,
  SmtpVerificationEmailSender,
} from '../../../../../src/modules/accounts/infrastructure/email/smtp-verification-email.sender.js';
import {
  BullMqVerificationEmailDelivery,
  SEND_VERIFICATION_EMAIL_JOB,
  type VerificationEmailJobData,
  type VerificationEmailQueue,
} from '../../../../../src/modules/accounts/infrastructure/messaging/verification-email.queue.js';
import {
  formatVerificationEmailDeliveryError,
  formatVerificationEmailWorkerError,
  VerificationEmailProcessor,
} from '../../../../../src/modules/accounts/infrastructure/messaging/verification-email.worker.js';

const MESSAGE: VerificationEmailMessage = {
  code: '042731',
  expiresAt: new Date('2026-09-20T02:10:00.000Z'),
  recipientEmail: 'student@u.nus.edu',
  verificationId: 'a23394c1-c131-4b77-bf0d-c39bc11bf81e',
};

describe('verification email delivery', () => {
  it('queues an idempotent job with retries and no retained code', async () => {
    const additions: Parameters<VerificationEmailQueue['add']>[] = [];
    const queue: VerificationEmailQueue = {
      add: (name, data, options) => {
        additions.push([name, data, options]);
        return Promise.resolve({ id: MESSAGE.verificationId });
      },
      close: () => Promise.resolve(),
    };
    const delivery = new BullMqVerificationEmailDelivery(
      'redis://localhost:6379',
      queue,
    );

    await delivery.enqueue(MESSAGE);

    expect(additions).toEqual([
      [
        SEND_VERIFICATION_EMAIL_JOB,
        {
          ...MESSAGE,
          expiresAt: MESSAGE.expiresAt.toISOString(),
        } satisfies VerificationEmailJobData,
        {
          attempts: 5,
          backoff: { delay: 5_000, type: 'exponential' },
          jobId: MESSAGE.verificationId,
          removeOnComplete: true,
          removeOnFail: true,
        },
      ],
    ]);
  });

  it('sends the code and expiry through the configured SMTP transport', async () => {
    const sentMail: Parameters<MailTransport['sendMail']>[0][] = [];
    const sender = new SmtpVerificationEmailSender(
      {
        sendMail: (options) => {
          sentMail.push(options);
          return Promise.resolve({ messageId: 'message-id' });
        },
      },
      'no-reply@friend-on-campus.example',
    );

    await sender.send(MESSAGE);

    expect(sentMail).toHaveLength(1);
    const delivered = sentMail[0] as Record<string, unknown>;
    expect(delivered['from']).toBe('no-reply@friend-on-campus.example');
    expect(delivered['html']).toEqual(expect.stringContaining(MESSAGE.code));
    expect(delivered['subject']).toBe('Verify your Friend on Campus account');
    expect(delivered['text']).toEqual(
      expect.stringContaining(MESSAGE.expiresAt.toISOString()),
    );
    expect(delivered['to']).toBe(MESSAGE.recipientEmail);
  });

  it('converts the queued expiry back to a Date before sending', async () => {
    const sentMessages: VerificationEmailMessage[] = [];
    const processor = new VerificationEmailProcessor({
      send: (message) => {
        sentMessages.push(message);
        return Promise.resolve();
      },
    });

    await processor.process({
      ...MESSAGE,
      expiresAt: MESSAGE.expiresAt.toISOString(),
    });

    expect(sentMessages).toEqual([MESSAGE]);
  });

  it('formats worker failures without logging sensitive error details', () => {
    const credential = 'credential-that-must-not-be-logged';
    const error = Object.assign(
      new Error(`Authentication failed: ${credential}`),
      {
        code: 'EAUTH',
        response: `535 rejected ${credential}`,
      },
    );

    const loggedMessage = formatVerificationEmailWorkerError(error);

    expect(loggedMessage).toBe('Verification email worker error (EAUTH).');
    expect(loggedMessage).not.toContain(credential);
    expect(loggedMessage).not.toContain(error.message);
    expect(loggedMessage).not.toContain(error.response);
    expect(formatVerificationEmailDeliveryError(error)).toBe(
      'Verification email delivery failed (EAUTH).',
    );
  });
});
