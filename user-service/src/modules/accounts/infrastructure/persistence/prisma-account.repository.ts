import type {
  AccountRepositoryPort,
  NewAccountRecord,
} from '../../application/ports/account-repository.port.js';
import type { AccountUniquenessPort } from '../../application/ports/account-uniqueness.port.js';
import { AccountAlreadyExistsError } from '../../application/errors/account-already-exists.error.js';
import { AccountStatus } from '../../domain/account-status.js';
import type { NusEmail } from '../../domain/nus-email.js';
import type { PhoneNumber } from '../../domain/phone-number.js';
import type { Username } from '../../domain/username.js';
import {
  Prisma,
  type PrismaClient,
  UserStatus as PrismaUserStatus,
} from '../../../../generated/prisma/client.js';

const PRISMA_STATUS_BY_DOMAIN: Record<AccountStatus, PrismaUserStatus> = {
  [AccountStatus.Active]: PrismaUserStatus.ACTIVE,
  [AccountStatus.Banned]: PrismaUserStatus.BANNED,
  [AccountStatus.PendingVerification]: PrismaUserStatus.PENDING_VERIFICATION,
  [AccountStatus.Suspended]: PrismaUserStatus.SUSPENDED,
};

export class PrismaAccountRepository
  implements AccountRepositoryPort, AccountUniquenessPort
{
  constructor(private readonly prisma: Pick<PrismaClient, 'user'>) {}

  async create(account: NewAccountRecord): Promise<void> {
    try {
      await this.prisma.user.create({
        data: {
          email: account.email,
          id: account.id,
          isAdmin: account.isAdmin,
          passwordHash: account.passwordHash,
          phoneNumber: account.phoneNumber,
          status: PRISMA_STATUS_BY_DOMAIN[account.status],
          username: account.username,
        },
      });
    } catch (error: unknown) {
      const duplicateField = this.getDuplicateField(error);

      if (duplicateField) {
        throw new AccountAlreadyExistsError(duplicateField);
      }

      throw error;
    }
  }

  async isEmailTaken(email: NusEmail): Promise<boolean> {
    const account = await this.prisma.user.findUnique({
      select: { id: true },
      where: { email: email.value },
    });

    return account !== null;
  }

  async isPhoneNumberTaken(phoneNumber: PhoneNumber): Promise<boolean> {
    const account = await this.prisma.user.findUnique({
      select: { id: true },
      where: { phoneNumber: phoneNumber.value },
    });

    return account !== null;
  }

  async isUsernameTaken(username: Username): Promise<boolean> {
    const account = await this.prisma.user.findUnique({
      select: { id: true },
      where: { username: username.value },
    });

    return account !== null;
  }

  private getDuplicateField(
    error: unknown,
  ): 'email' | 'phoneNumber' | 'username' | undefined {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      return undefined;
    }

    const target = JSON.stringify(error.meta?.target ?? '').toLowerCase();

    if (target.includes('username')) {
      return 'username';
    }

    if (target.includes('email')) {
      return 'email';
    }

    if (target.includes('phone_number') || target.includes('phonenumber')) {
      return 'phoneNumber';
    }

    return undefined;
  }
}
