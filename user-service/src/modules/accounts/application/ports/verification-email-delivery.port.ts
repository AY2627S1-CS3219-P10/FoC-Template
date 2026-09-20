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
