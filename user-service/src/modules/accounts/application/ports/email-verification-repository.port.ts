/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of email verification repository port code (IssueEmailVerificationCodeRecord, VerifyEmailInput, PendingVerificationAccount).
 * Author review: Checked existing IssueEmailVerificationCodeRecord, VerifyEmailInput parameter and return types against their callers; edited type declaration layout and member naming.
 */

export interface IssueEmailVerificationCodeRecord {
  codeHash: string;
  createdAt: Date;
  expiresAt: Date;
  id: string;
  userId: string;
}

export interface VerifyEmailInput {
  candidateCodeHash: string;
  email: string;
  eventId: string;
  maximumAttempts: number;
  now: Date;
}

export interface PendingVerificationAccount {
  email: string;
  id: string;
}

export interface EmailVerificationRepositoryPort {
  findPendingAccountByEmail(
    email: string,
  ): Promise<PendingVerificationAccount | null>;
  issueCode(record: IssueEmailVerificationCodeRecord): Promise<boolean>;
  verifyAndActivate(input: VerifyEmailInput): Promise<boolean>;
}
