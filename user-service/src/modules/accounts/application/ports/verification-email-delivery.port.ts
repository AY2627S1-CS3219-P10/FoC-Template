/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of verification email delivery port code (VerificationEmailMessage, VerificationEmailDeliveryPort, VerificationEmailSenderPort).
 * Author review: Checked existing VerificationEmailMessage, VerificationEmailDeliveryPort parameter and return types against their callers; edited type declaration layout and member naming.
 */

export interface VerificationEmailMessage {
  code: string;
  expiresAt: Date;
  recipientEmail: string;
  verificationId: string;
}

export interface VerificationEmailDeliveryPort {
  enqueue(message: VerificationEmailMessage): Promise<void>;
}

export interface VerificationEmailSenderPort {
  send(message: VerificationEmailMessage): Promise<void>;
}
