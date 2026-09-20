import { EmailVerificationCode } from '../../domain/email-verification-code.js';
import { EmailVerificationError } from '../errors/email-verification.error.js';
import type { ClockPort } from '../ports/clock.port.js';
import type { EmailVerificationRepositoryPort } from '../ports/email-verification-repository.port.js';
import type { IdGeneratorPort } from '../ports/id-generator.port.js';
import type { VerificationCodeGeneratorPort } from '../ports/verification-code-generator.port.js';
import type { VerificationCodeHasherPort } from '../ports/verification-code-hasher.port.js';

export const EMAIL_VERIFICATION_CODE_LIFETIME_MS = 10 * 60 * 1000;

export interface IssueEmailVerificationCodeDependencies {
  clock: ClockPort;
  codeGenerator: VerificationCodeGeneratorPort;
  codeHasher: VerificationCodeHasherPort;
  idGenerator: IdGeneratorPort;
  repository: EmailVerificationRepositoryPort;
}

export interface IssueEmailVerificationCodeResult {
  code: string;
  expiresAt: Date;
  verificationId: string;
}

export class IssueEmailVerificationCodeUseCase {
  constructor(
    private readonly dependencies: IssueEmailVerificationCodeDependencies,
  ) {}

  async execute(userId: string): Promise<IssueEmailVerificationCodeResult> {
    const now = this.dependencies.clock.now();
    const code = EmailVerificationCode.create(
      this.dependencies.codeGenerator.generate(),
    );
    const expiresAt = new Date(
      now.getTime() + EMAIL_VERIFICATION_CODE_LIFETIME_MS,
    );
    const verificationId = this.dependencies.idGenerator.generate();
    const issued = await this.dependencies.repository.issueCode({
      codeHash: this.dependencies.codeHasher.hash(code.value),
      createdAt: now,
      expiresAt,
      id: verificationId,
      userId,
    });

    if (!issued) {
      throw new EmailVerificationError(
        'ACCOUNT_NOT_PENDING_VERIFICATION',
        'Account is not awaiting email verification.',
      );
    }

    return { code: code.value, expiresAt, verificationId };
  }
}
