/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of smtp verification email sender code (MailTransport, SmtpVerificationEmailSender).
 * Author review: Validated MailTransport, SmtpVerificationEmailSender value handling and returned results in user-service/smtp-verification-email.sender.ts; edited naming and formatting for readability.
 */

import type { SendMailOptions } from 'nodemailer';

import type {
  VerificationEmailMessage,
  VerificationEmailSenderPort,
} from '../../application/ports/verification-email-delivery.port.js';

export interface MailTransport {
  sendMail(options: SendMailOptions): Promise<unknown>;
}

export class SmtpVerificationEmailSender implements VerificationEmailSenderPort {
  constructor(
    private readonly transporter: MailTransport,
    private readonly fromAddress: string,
  ) {}

  async send(message: VerificationEmailMessage): Promise<void> {
    const expiresAt = message.expiresAt.toISOString();

    await this.transporter.sendMail({
      from: this.fromAddress,
      html: [
        '<p>Welcome to Friend on Campus.</p>',
        `<p>Your verification code is <strong>${message.code}</strong>.</p>`,
        `<p>This code expires at ${expiresAt}.</p>`,
        '<p>If you did not create this account, you can ignore this email.</p>',
      ].join(''),
      subject: 'Verify your Friend on Campus account',
      text: [
        'Welcome to Friend on Campus.',
        '',
        `Your verification code is ${message.code}.`,
        `This code expires at ${expiresAt}.`,
        '',
        'If you did not create this account, you can ignore this email.',
      ].join('\n'),
      to: message.recipientEmail,
    });
  }
}
