import { ModerationError } from '../../application/errors/moderation.error.js';
import type {
  ListReportsInput,
  ModerationRepositoryPort,
  SuspendAccountRecord,
  SuspendedAccount,
  UserReport,
} from '../../application/ports/moderation-repository.port.js';
import {
  Prisma,
  type PrismaClient,
  UserStatus,
} from '../../../../generated/prisma/client.js';

const IDENTITY_SELECT = { id: true, username: true } as const;
const REPORT_SELECT = {
  id: true,
  reporterUserId: true,
  reportedUserId: true,
  description: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
  reporter: { select: IDENTITY_SELECT },
  reportedUser: { select: IDENTITY_SELECT },
  resolvedBy: { select: IDENTITY_SELECT },
} as const;

export class PrismaModerationRepository implements ModerationRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  createReport(input: {
    reporterUserId: string;
    reportedUserId: string;
    description: string;
  }): Promise<UserReport | null> {
    return this.prisma.$transaction(async (tx) => {
      // Keep the target present until its FK is established.
      const target = await tx.$queryRaw<
        { id: string }[]
      >`SELECT "id" FROM "users" WHERE "id" = ${input.reportedUserId}::uuid FOR KEY SHARE`;
      if (!target.length) return null;
      return tx.userReport.create({ data: input, select: REPORT_SELECT });
    });
  }

  listReports(input: ListReportsInput): Promise<UserReport[]> {
    return this.prisma.userReport.findMany({
      select: REPORT_SELECT,
      where: input.status ? { status: input.status } : undefined,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit,
      skip: input.offset,
    });
  }
  findReport(id: string): Promise<UserReport | null> {
    return this.prisma.userReport.findUnique({
      where: { id },
      select: REPORT_SELECT,
    });
  }
  resolveReport(input: {
    reportId: string;
    actorUserId: string;
    resolvedAt: Date;
  }): Promise<UserReport | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.userReport.updateMany({
        where: { id: input.reportId, status: 'OPEN' },
        data: {
          status: 'RESOLVED',
          resolvedAt: input.resolvedAt,
          resolvedById: input.actorUserId,
        },
      });
      return tx.userReport.findUnique({
        where: { id: input.reportId },
        select: REPORT_SELECT,
      });
    });
  }

  async suspendAccount(
    input: SuspendAccountRecord,
  ): Promise<SuspendedAccount | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(3219, 1)`;
        const actor = await tx.user.findUnique({
          where: { id: input.actorUserId },
          select: { isAdmin: true, status: true, suspendedUntil: true },
        });
        if (
          !actor?.isAdmin ||
          actor.status !== UserStatus.ACTIVE ||
          (actor.suspendedUntil && actor.suspendedUntil > input.changedAt)
        )
          throw new ModerationError(
            'ADMINISTRATOR_PRIVILEGES_REQUIRED',
            'Active administrator privileges are required.',
          );
        if (input.actorUserId === input.targetUserId)
          throw new ModerationError(
            'SELF_SUSPENSION_FORBIDDEN',
            'Administrators cannot suspend themselves.',
          );
        await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${input.targetUserId}::uuid FOR UPDATE`;
        const target = await tx.user.findUnique({
          where: { id: input.targetUserId },
          select: { id: true, status: true, isAdmin: true },
        });
        if (!target) return null;
        if (target.status !== UserStatus.ACTIVE)
          throw new ModerationError(
            'ACCOUNT_NOT_SUSPENDABLE',
            'Only active accounts can receive a temporary suspension.',
          );
        if (target.isAdmin) {
          const others = await tx.user.count({
            where: {
              id: { not: target.id },
              isAdmin: true,
              status: UserStatus.ACTIVE,
              OR: [
                { suspendedUntil: null },
                { suspendedUntil: { lte: input.changedAt } },
              ],
            },
          });
          if (!others)
            throw new ModerationError(
              'LAST_ADMINISTRATOR_REQUIRED',
              'The system must retain at least one usable administrator.',
            );
        }
        const updated = await tx.user.update({
          where: { id: target.id },
          data: { suspendedUntil: input.suspendedUntil },
          select: { id: true, username: true, suspendedUntil: true },
        });
        await tx.session.updateMany({
          where: { userId: target.id, revokedAt: null },
          data: { revokedAt: input.changedAt },
        });
        return { ...updated, suspendedUntil: input.suspendedUntil };
      });
    } catch (error) {
      const details =
        error instanceof Prisma.PrismaClientKnownRequestError
          ? `${error.message} ${JSON.stringify(error.meta ?? {})}`
          : error instanceof Error
            ? error.message
            : '';
      if (details.includes('users_require_at_least_one_administrator'))
        throw new ModerationError(
          'LAST_ADMINISTRATOR_REQUIRED',
          'The system must retain at least one usable administrator.',
        );
      throw error;
    }
  }
}
