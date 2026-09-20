import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvironmentVariables } from '../../platform/config/environment.schema.js';
import { DatabaseModule } from '../../platform/database/database.module.js';
import { PrismaService } from '../../platform/database/prisma.service.js';
import { IssueEmailVerificationCodeUseCase } from './application/use-cases/issue-email-verification-code.use-case.js';
import { RegisterAccountUseCase } from './application/use-cases/register-account.use-case.js';
import { VerifyEmailUseCase } from './application/use-cases/verify-email.use-case.js';
import { PrismaAccountRepository } from './infrastructure/persistence/prisma-account.repository.js';
import { PrismaEmailVerificationRepository } from './infrastructure/persistence/prisma-email-verification.repository.js';
import { Argon2PasswordHasher } from './infrastructure/security/argon2-password-hasher.js';
import { HmacVerificationCodeHasher } from './infrastructure/security/hmac-verification-code-hasher.js';
import { SixDigitCodeGenerator } from './infrastructure/security/six-digit-code-generator.js';
import { UuidGenerator } from './infrastructure/security/uuid-generator.js';
import { SystemClock } from './infrastructure/system-clock.js';
import { AccountsController } from './presentation/http/accounts.controller.js';

@Module({
  controllers: [AccountsController],
  imports: [DatabaseModule],
  providers: [
    {
      inject: [PrismaService],
      provide: PrismaAccountRepository,
      useFactory: (prisma: PrismaService): PrismaAccountRepository =>
        new PrismaAccountRepository(prisma),
    },
    {
      provide: Argon2PasswordHasher,
      useFactory: (): Argon2PasswordHasher => new Argon2PasswordHasher(),
    },
    {
      provide: UuidGenerator,
      useFactory: (): UuidGenerator => new UuidGenerator(),
    },
    {
      inject: [PrismaService],
      provide: PrismaEmailVerificationRepository,
      useFactory: (prisma: PrismaService): PrismaEmailVerificationRepository =>
        new PrismaEmailVerificationRepository(prisma),
    },
    {
      inject: [ConfigService],
      provide: HmacVerificationCodeHasher,
      useFactory: (
        config: ConfigService<EnvironmentVariables, true>,
      ): HmacVerificationCodeHasher =>
        new HmacVerificationCodeHasher(
          config.get('EMAIL_VERIFICATION_CODE_SECRET', { infer: true }),
        ),
    },
    {
      provide: SixDigitCodeGenerator,
      useFactory: (): SixDigitCodeGenerator => new SixDigitCodeGenerator(),
    },
    {
      provide: SystemClock,
      useFactory: (): SystemClock => new SystemClock(),
    },
    {
      inject: [PrismaAccountRepository, Argon2PasswordHasher, UuidGenerator],
      provide: RegisterAccountUseCase,
      useFactory: (
        accountRepository: PrismaAccountRepository,
        passwordHasher: Argon2PasswordHasher,
        idGenerator: UuidGenerator,
      ): RegisterAccountUseCase =>
        new RegisterAccountUseCase({
          accountRepository,
          accountUniqueness: accountRepository,
          idGenerator,
          passwordHasher,
        }),
    },
    {
      inject: [
        PrismaEmailVerificationRepository,
        SixDigitCodeGenerator,
        HmacVerificationCodeHasher,
        UuidGenerator,
        SystemClock,
      ],
      provide: IssueEmailVerificationCodeUseCase,
      useFactory: (
        repository: PrismaEmailVerificationRepository,
        codeGenerator: SixDigitCodeGenerator,
        codeHasher: HmacVerificationCodeHasher,
        idGenerator: UuidGenerator,
        clock: SystemClock,
      ): IssueEmailVerificationCodeUseCase =>
        new IssueEmailVerificationCodeUseCase({
          clock,
          codeGenerator,
          codeHasher,
          idGenerator,
          repository,
        }),
    },
    {
      inject: [
        PrismaEmailVerificationRepository,
        HmacVerificationCodeHasher,
        SystemClock,
      ],
      provide: VerifyEmailUseCase,
      useFactory: (
        repository: PrismaEmailVerificationRepository,
        codeHasher: HmacVerificationCodeHasher,
        clock: SystemClock,
      ): VerifyEmailUseCase =>
        new VerifyEmailUseCase({ clock, codeHasher, repository }),
    },
  ],
})
export class AccountsModule {}
