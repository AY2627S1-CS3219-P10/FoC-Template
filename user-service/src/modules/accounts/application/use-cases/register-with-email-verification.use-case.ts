import type { VerificationEmailDeliveryPort } from '../ports/verification-email-delivery.port.js';
import type {
  RegisterAccountInput,
  RegisterAccountResult,
} from './register-account.use-case.js';
import type { IssueEmailVerificationCodeUseCase } from './issue-email-verification-code.use-case.js';
import type { RegisterAccountUseCase } from './register-account.use-case.js';

export interface RegisterWithEmailVerificationDependencies {
  emailDelivery: VerificationEmailDeliveryPort;
  issueEmailVerificationCode: Pick<
    IssueEmailVerificationCodeUseCase,
    'execute'
  >;
  registerAccount: Pick<RegisterAccountUseCase, 'execute'>;
}

export class RegisterWithEmailVerificationUseCase {
  constructor(
    private readonly dependencies: RegisterWithEmailVerificationDependencies,
  ) {}

  async execute(input: RegisterAccountInput): Promise<RegisterAccountResult> {
    const account = await this.dependencies.registerAccount.execute(input);
    const verification =
      await this.dependencies.issueEmailVerificationCode.execute(account.id);

    await this.dependencies.emailDelivery.enqueue({
      code: verification.code,
      expiresAt: verification.expiresAt,
      recipientEmail: account.email,
      verificationId: verification.verificationId,
    });

    return account;
  }
}
