import { AccountAlreadyExistsError } from '../../application/errors/account-already-exists.error.js';
import type {
  AccountCredentials,
  AccountProfile,
  ChangePasswordRecord,
  ProfileRepositoryPort,
} from '../../application/ports/profile-repository.port.js';
import { AccountStatus } from '../../domain/account-status.js';
import {
  Prisma,
  type PrismaClient,
  UserStatus,
} from '../../../../generated/prisma/client.js';

const DOMAIN_STATUS_BY_PRISMA: Record<UserStatus, AccountStatus> = {
  [UserStatus.ACTIVE]: AccountStatus.Active,
  [UserStatus.BANNED]: AccountStatus.Banned,
  [UserStatus.PENDING_VERIFICATION]: AccountStatus.PendingVerification,
  [UserStatus.SUSPENDED]: AccountStatus.Suspended,
};

const PROFILE_SELECT = {
  createdAt: true,
  email: true,
  emailVerifiedAt: true,
  id: true,
  isAdmin: true,
  phoneNumber: true,
  status: true,
  updatedAt: true,
  username: true,
} as const;

export class PrismaProfileRepository implements ProfileRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async changePasswordAndRevokeSessions(
    input: ChangePasswordRecord,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        data: {
          passwordChangedAt: input.changedAt,
          passwordHash: input.passwordHash,
        },
        where: { id: input.userId },
      });
      await transaction.session.updateMany({
        data: { revokedAt: input.changedAt },
        where: { revokedAt: null, userId: input.userId },
      });
    });
  }

  findCredentialsById(userId: string): Promise<AccountCredentials | null> {
    return this.prisma.user.findUnique({
      select: { id: true, passwordHash: true },
      where: { id: userId },
    });
  }

  async findProfileById(userId: string): Promise<AccountProfile | null> {
    const profile = await this.prisma.user.findUnique({
      select: PROFILE_SELECT,
      where: { id: userId },
    });

    return profile
      ? { ...profile, status: DOMAIN_STATUS_BY_PRISMA[profile.status] }
      : null;
  }

  async updatePhoneNumber(
    userId: string,
    phoneNumber: string,
  ): Promise<AccountProfile | null> {
    try {
      const profile = await this.prisma.user.update({
        data: { phoneNumber },
        select: PROFILE_SELECT,
        where: { id: userId },
      });

      return {
        ...profile,
        status: DOMAIN_STATUS_BY_PRISMA[profile.status],
      };
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new AccountAlreadyExistsError('phoneNumber');
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        return null;
      }

      throw error;
    }
  }

  async updateUsername(
    userId: string,
    username: string,
  ): Promise<AccountProfile | null> {
    try {
      const profile = await this.prisma.user.update({
        data: { username },
        select: PROFILE_SELECT,
        where: { id: userId },
      });

      return {
        ...profile,
        status: DOMAIN_STATUS_BY_PRISMA[profile.status],
      };
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new AccountAlreadyExistsError('username');
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        return null;
      }

      throw error;
    }
  }
}
