import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

import type { EnvironmentVariables } from '../../platform/config/environment.schema.js';
import { DatabaseModule } from '../../platform/database/database.module.js';
import { PrismaService } from '../../platform/database/prisma.service.js';
import { SessionTokenIssuer } from './application/services/session-token-issuer.js';
import { AuthenticateAccessTokenUseCase } from './application/use-cases/authenticate-access-token.use-case.js';
import { ChangeAdministratorPrivilegeUseCase } from './application/use-cases/change-administrator-privilege.use-case.js';
import { ChangePasswordUseCase } from './application/use-cases/change-password.use-case.js';
import { FindAdministratorAccountsUseCase } from './application/use-cases/find-administrator-accounts.use-case.js';
import { GetProfileUseCase } from './application/use-cases/get-profile.use-case.js';
import { IssueEmailVerificationCodeUseCase } from './application/use-cases/issue-email-verification-code.use-case.js';
import { LoginUseCase } from './application/use-cases/login.use-case.js';
import { LogoutUseCase } from './application/use-cases/logout.use-case.js';
import { RefreshSessionUseCase } from './application/use-cases/refresh-session.use-case.js';
import { ResendVerificationEmailUseCase } from './application/use-cases/resend-verification-email.use-case.js';
import { RegisterAccountUseCase } from './application/use-cases/register-account.use-case.js';
import { RegisterWithEmailVerificationUseCase } from './application/use-cases/register-with-email-verification.use-case.js';
import { VerifyEmailUseCase } from './application/use-cases/verify-email.use-case.js';
import { UpdatePhoneNumberUseCase } from './application/use-cases/update-phone-number.use-case.js';
import { SmtpVerificationEmailSender } from './infrastructure/email/smtp-verification-email.sender.js';
import { RedisVerificationEmailResendRateLimiter } from './infrastructure/messaging/redis-verification-email-resend-rate-limiter.js';
import { BullMqVerificationEmailDelivery } from './infrastructure/messaging/verification-email.queue.js';
import {
  VerificationEmailProcessor,
  VerificationEmailWorker,
} from './infrastructure/messaging/verification-email.worker.js';
import { PrismaAccountRepository } from './infrastructure/persistence/prisma-account.repository.js';
import { PrismaAdministratorAccountDiscoveryRepository } from './infrastructure/persistence/prisma-administrator-account-discovery.repository.js';
import { PrismaAdministratorPrivilegeRepository } from './infrastructure/persistence/prisma-administrator-privilege.repository.js';
import { PrismaAuthenticationRepository } from './infrastructure/persistence/prisma-authentication.repository.js';
import { PrismaEmailVerificationRepository } from './infrastructure/persistence/prisma-email-verification.repository.js';
import { PrismaProfileRepository } from './infrastructure/persistence/prisma-profile.repository.js';
import { Argon2PasswordHasher } from './infrastructure/security/argon2-password-hasher.js';
import { HmacVerificationCodeHasher } from './infrastructure/security/hmac-verification-code-hasher.js';
import { JoseAccessToken } from './infrastructure/security/jose-access-token.js';
import { SecureRefreshToken } from './infrastructure/security/secure-refresh-token.js';
import { SixDigitCodeGenerator } from './infrastructure/security/six-digit-code-generator.js';
import { UuidGenerator } from './infrastructure/security/uuid-generator.js';
import { SystemClock } from './infrastructure/system-clock.js';
import { AccountsController } from './presentation/http/accounts.controller.js';
import { AdministratorAccountsController } from './presentation/http/administrator-accounts.controller.js';
import { AuthenticationController } from './presentation/http/authentication.controller.js';
import { ProfileController } from './presentation/http/profile.controller.js';
import { AdministratorAuthorizationGuard } from './presentation/http/security/administrator-authorization.guard.js';
import { BearerAuthenticationGuard } from './presentation/http/security/bearer-authentication.guard.js';

@Module({
  controllers: [
    AccountsController,
    AdministratorAccountsController,
    AuthenticationController,
    ProfileController,
  ],
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
      inject: [PrismaService],
      provide: PrismaAuthenticationRepository,
      useFactory: (prisma: PrismaService): PrismaAuthenticationRepository =>
        new PrismaAuthenticationRepository(prisma),
    },
    {
      inject: [PrismaService],
      provide: PrismaAdministratorAccountDiscoveryRepository,
      useFactory: (
        prisma: PrismaService,
      ): PrismaAdministratorAccountDiscoveryRepository =>
        new PrismaAdministratorAccountDiscoveryRepository(prisma),
    },
    {
      inject: [PrismaService],
      provide: PrismaAdministratorPrivilegeRepository,
      useFactory: (
        prisma: PrismaService,
      ): PrismaAdministratorPrivilegeRepository =>
        new PrismaAdministratorPrivilegeRepository(prisma),
    },
    {
      inject: [PrismaService],
      provide: PrismaProfileRepository,
      useFactory: (prisma: PrismaService): PrismaProfileRepository =>
        new PrismaProfileRepository(prisma),
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
      provide: SecureRefreshToken,
      useFactory: (): SecureRefreshToken => new SecureRefreshToken(),
    },
    {
      inject: [ConfigService],
      provide: JoseAccessToken,
      useFactory: (
        config: ConfigService<EnvironmentVariables, true>,
      ): JoseAccessToken =>
        new JoseAccessToken(
          config.get('JWT_ACCESS_TOKEN_SECRET', { infer: true }),
        ),
    },
    {
      inject: [JoseAccessToken, SystemClock, PrismaAuthenticationRepository],
      provide: AuthenticateAccessTokenUseCase,
      useFactory: (
        accessTokens: JoseAccessToken,
        clock: SystemClock,
        repository: PrismaAuthenticationRepository,
      ): AuthenticateAccessTokenUseCase =>
        new AuthenticateAccessTokenUseCase({
          accessTokens,
          clock,
          repository,
        }),
    },
    BearerAuthenticationGuard,
    AdministratorAuthorizationGuard,
    {
      inject: [SystemClock, PrismaAdministratorPrivilegeRepository],
      provide: ChangeAdministratorPrivilegeUseCase,
      useFactory: (
        clock: SystemClock,
        repository: PrismaAdministratorPrivilegeRepository,
      ): ChangeAdministratorPrivilegeUseCase =>
        new ChangeAdministratorPrivilegeUseCase({ clock, repository }),
    },
    {
      inject: [PrismaAdministratorAccountDiscoveryRepository],
      provide: FindAdministratorAccountsUseCase,
      useFactory: (
        repository: PrismaAdministratorAccountDiscoveryRepository,
      ): FindAdministratorAccountsUseCase =>
        new FindAdministratorAccountsUseCase(repository),
    },
    {
      inject: [PrismaProfileRepository],
      provide: GetProfileUseCase,
      useFactory: (repository: PrismaProfileRepository): GetProfileUseCase =>
        new GetProfileUseCase(repository),
    },
    {
      inject: [PrismaProfileRepository],
      provide: UpdatePhoneNumberUseCase,
      useFactory: (
        repository: PrismaProfileRepository,
      ): UpdatePhoneNumberUseCase => new UpdatePhoneNumberUseCase(repository),
    },
    {
      inject: [SystemClock, Argon2PasswordHasher, PrismaProfileRepository],
      provide: ChangePasswordUseCase,
      useFactory: (
        clock: SystemClock,
        passwordHasher: Argon2PasswordHasher,
        repository: PrismaProfileRepository,
      ): ChangePasswordUseCase =>
        new ChangePasswordUseCase({
          clock,
          passwordHasher,
          passwordVerifier: passwordHasher,
          repository,
        }),
    },
    {
      inject: [JoseAccessToken, SystemClock, UuidGenerator, SecureRefreshToken],
      provide: SessionTokenIssuer,
      useFactory: (
        accessTokens: JoseAccessToken,
        clock: SystemClock,
        idGenerator: UuidGenerator,
        refreshTokens: SecureRefreshToken,
      ): SessionTokenIssuer =>
        new SessionTokenIssuer({
          accessTokens,
          clock,
          idGenerator,
          refreshTokens,
        }),
    },
    {
      inject: [
        PrismaAuthenticationRepository,
        Argon2PasswordHasher,
        SessionTokenIssuer,
      ],
      provide: LoginUseCase,
      useFactory: (
        repository: PrismaAuthenticationRepository,
        passwordVerifier: Argon2PasswordHasher,
        sessionTokenIssuer: SessionTokenIssuer,
      ): LoginUseCase =>
        new LoginUseCase({
          passwordVerifier,
          repository,
          sessionTokenIssuer,
        }),
    },
    {
      inject: [SystemClock, SecureRefreshToken, PrismaAuthenticationRepository],
      provide: LogoutUseCase,
      useFactory: (
        clock: SystemClock,
        refreshTokens: SecureRefreshToken,
        repository: PrismaAuthenticationRepository,
      ): LogoutUseCase =>
        new LogoutUseCase({ clock, refreshTokens, repository }),
    },
    {
      inject: [
        SystemClock,
        SecureRefreshToken,
        PrismaAuthenticationRepository,
        SessionTokenIssuer,
      ],
      provide: RefreshSessionUseCase,
      useFactory: (
        clock: SystemClock,
        refreshTokens: SecureRefreshToken,
        repository: PrismaAuthenticationRepository,
        sessionTokenIssuer: SessionTokenIssuer,
      ): RefreshSessionUseCase =>
        new RefreshSessionUseCase({
          clock,
          refreshTokens,
          repository,
          sessionTokenIssuer,
        }),
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
      inject: [ConfigService],
      provide: BullMqVerificationEmailDelivery,
      useFactory: (
        config: ConfigService<EnvironmentVariables, true>,
      ): BullMqVerificationEmailDelivery =>
        new BullMqVerificationEmailDelivery(
          config.get('REDIS_URL', { infer: true }),
        ),
    },
    {
      inject: [ConfigService],
      provide: RedisVerificationEmailResendRateLimiter,
      useFactory: (
        config: ConfigService<EnvironmentVariables, true>,
      ): RedisVerificationEmailResendRateLimiter =>
        new RedisVerificationEmailResendRateLimiter(
          config.get('REDIS_URL', { infer: true }),
        ),
    },
    {
      inject: [ConfigService],
      provide: SmtpVerificationEmailSender,
      useFactory: (
        config: ConfigService<EnvironmentVariables, true>,
      ): SmtpVerificationEmailSender =>
        new SmtpVerificationEmailSender(
          nodemailer.createTransport({
            auth: {
              pass: config.get('SMTP_PASSWORD', { infer: true }),
              user: config.get('SMTP_USER', { infer: true }),
            },
            host: config.get('SMTP_HOST', { infer: true }),
            port: config.get('SMTP_PORT', { infer: true }),
            secure: config.get('SMTP_SECURE', { infer: true }),
          }),
          config.get('SMTP_FROM', { infer: true }),
        ),
    },
    {
      inject: [SmtpVerificationEmailSender],
      provide: VerificationEmailProcessor,
      useFactory: (
        sender: SmtpVerificationEmailSender,
      ): VerificationEmailProcessor => new VerificationEmailProcessor(sender),
    },
    {
      inject: [ConfigService, VerificationEmailProcessor],
      provide: VerificationEmailWorker,
      useFactory: (
        config: ConfigService<EnvironmentVariables, true>,
        processor: VerificationEmailProcessor,
      ): VerificationEmailWorker =>
        new VerificationEmailWorker(
          config.get('REDIS_URL', { infer: true }),
          processor,
        ),
    },
    {
      inject: [
        RegisterAccountUseCase,
        IssueEmailVerificationCodeUseCase,
        BullMqVerificationEmailDelivery,
      ],
      provide: RegisterWithEmailVerificationUseCase,
      useFactory: (
        registerAccount: RegisterAccountUseCase,
        issueEmailVerificationCode: IssueEmailVerificationCodeUseCase,
        emailDelivery: BullMqVerificationEmailDelivery,
      ): RegisterWithEmailVerificationUseCase =>
        new RegisterWithEmailVerificationUseCase({
          emailDelivery,
          issueEmailVerificationCode,
          registerAccount,
        }),
    },
    {
      inject: [
        PrismaEmailVerificationRepository,
        IssueEmailVerificationCodeUseCase,
        BullMqVerificationEmailDelivery,
        RedisVerificationEmailResendRateLimiter,
      ],
      provide: ResendVerificationEmailUseCase,
      useFactory: (
        repository: PrismaEmailVerificationRepository,
        issueEmailVerificationCode: IssueEmailVerificationCodeUseCase,
        emailDelivery: BullMqVerificationEmailDelivery,
        rateLimiter: RedisVerificationEmailResendRateLimiter,
      ): ResendVerificationEmailUseCase =>
        new ResendVerificationEmailUseCase({
          emailDelivery,
          issueEmailVerificationCode,
          rateLimiter,
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
  exports: [AdministratorAuthorizationGuard, BearerAuthenticationGuard],
})
export class AccountsModule {}
