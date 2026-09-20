import type {
  ActiveSessionInput,
  AuthenticatedAccount,
  AuthenticationAccount,
  AuthenticationRepositoryPort,
  RevokeSessionInput,
  RotateSessionInput,
  SessionRecord,
} from '../../application/ports/authentication-repository.port.js';
import { AccountStatus } from '../../domain/account-status.js';
import {
  type PrismaClient,
  UserStatus,
} from '../../../../generated/prisma/client.js';

const DOMAIN_STATUS_BY_PRISMA: Record<UserStatus, AccountStatus> = {
  [UserStatus.ACTIVE]: AccountStatus.Active,
  [UserStatus.BANNED]: AccountStatus.Banned,
  [UserStatus.PENDING_VERIFICATION]: AccountStatus.PendingVerification,
  [UserStatus.SUSPENDED]: AccountStatus.Suspended,
};

export class PrismaAuthenticationRepository implements AuthenticationRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  createSession(session: SessionRecord): Promise<void> {
    return this.prisma.session.create({ data: session }).then(() => undefined);
  }

  async findActiveSessionAccount(
    input: ActiveSessionInput,
  ): Promise<AuthenticatedAccount | null> {
    const session = await this.prisma.session.findFirst({
      select: {
        user: {
          select: {
            id: true,
            isAdmin: true,
            status: true,
            username: true,
          },
        },
      },
      where: {
        expiresAt: { gt: input.now },
        id: input.sessionId,
        revokedAt: null,
        user: { status: UserStatus.ACTIVE },
        userId: input.userId,
      },
    });

    return session
      ? {
          ...session.user,
          status: DOMAIN_STATUS_BY_PRISMA[session.user.status],
        }
      : null;
  }

  async findAccountByEmail(
    email: string,
  ): Promise<AuthenticationAccount | null> {
    const account = await this.prisma.user.findUnique({
      select: {
        email: true,
        id: true,
        isAdmin: true,
        passwordHash: true,
        status: true,
        username: true,
      },
      where: { email },
    });

    return account
      ? { ...account, status: DOMAIN_STATUS_BY_PRISMA[account.status] }
      : null;
  }

  revokeSession(input: RevokeSessionInput): Promise<void> {
    return this.prisma.session
      .updateMany({
        data: { revokedAt: input.now },
        where: {
          expiresAt: { gt: input.now },
          refreshTokenHash: input.refreshTokenHash,
          revokedAt: null,
        },
      })
      .then(() => undefined);
  }

  rotateSession(
    input: RotateSessionInput,
  ): Promise<AuthenticatedAccount | null> {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.session.findUnique({
        select: {
          expiresAt: true,
          id: true,
          revokedAt: true,
          user: {
            select: {
              id: true,
              isAdmin: true,
              status: true,
              username: true,
            },
          },
          userId: true,
        },
        where: { refreshTokenHash: input.currentRefreshTokenHash },
      });

      if (!current) {
        return null;
      }

      if (current.revokedAt) {
        await transaction.session.updateMany({
          data: { revokedAt: input.now },
          where: { revokedAt: null, userId: current.userId },
        });

        return null;
      }

      if (
        current.expiresAt <= input.now ||
        current.user.status !== UserStatus.ACTIVE
      ) {
        await transaction.session.updateMany({
          data: { revokedAt: input.now },
          where: { revokedAt: null, userId: current.userId },
        });

        return null;
      }

      const revoked = await transaction.session.updateMany({
        data: { revokedAt: input.now },
        where: {
          expiresAt: { gt: input.now },
          id: current.id,
          revokedAt: null,
        },
      });

      if (revoked.count !== 1) {
        return null;
      }

      await transaction.session.create({
        data: { ...input.replacement, userId: current.userId },
      });

      return {
        id: current.user.id,
        isAdmin: current.user.isAdmin,
        status: DOMAIN_STATUS_BY_PRISMA[current.user.status],
        username: current.user.username,
      };
    });
  }
}
