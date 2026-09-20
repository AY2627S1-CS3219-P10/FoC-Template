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
  maximumAttempts: number;
  now: Date;
}

export interface EmailVerificationRepositoryPort {
  issueCode(record: IssueEmailVerificationCodeRecord): Promise<boolean>;
  verifyAndActivate(input: VerifyEmailInput): Promise<boolean>;
}
