import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../platform/database/database.module.js';
import { PrismaService } from '../../platform/database/prisma.service.js';
import { RegisterAccountUseCase } from './application/use-cases/register-account.use-case.js';
import { PrismaAccountRepository } from './infrastructure/persistence/prisma-account.repository.js';
import { Argon2PasswordHasher } from './infrastructure/security/argon2-password-hasher.js';
import { UuidGenerator } from './infrastructure/security/uuid-generator.js';
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
  ],
})
export class AccountsModule {}
