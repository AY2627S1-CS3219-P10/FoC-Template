import type {
  CreateUserReportRecord,
  ResolveUserReportRecord,
  UserReportRecord,
  UserReportRepositoryPort,
} from '../../application/ports/user-report-repository.port.js';
import { UserReportStatus } from '../../application/ports/user-report-repository.port.js';
import {
  type Prisma,
  type PrismaClient,
  UserReportStatus as PrismaUserReportStatus,
} from '../../../../generated/prisma/client.js';

const reportSelection = {
  createdAt: true,
  description: true,
  id: true,
  reportedUser: { select: { id: true, username: true } },
  reporter: { select: { id: true, username: true } },
  resolvedAt: true,
  status: true,
  updatedAt: true,
} as const;

type PrismaReport = Prisma.UserReportGetPayload<{
  select: typeof reportSelection;
}>;

export class PrismaUserReportRepository implements UserReportRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  createReport(
    input: CreateUserReportRecord,
  ): Promise<UserReportRecord | null> {
    return this.prisma.$transaction(async (transaction) => {
      const target = await transaction.user.findUnique({
        select: { id: true },
        where: { id: input.reportedUserId },
      });
      if (!target) {
        return null;
      }

      const report = await transaction.userReport.create({
        data: input,
        select: reportSelection,
      });
      return this.toDomain(report);
    });
  }

  async listReports(): Promise<UserReportRecord[]> {
    const reports = await this.prisma.userReport.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: reportSelection,
    });
    return reports.map((report) => this.toDomain(report));
  }

  resolveReport(
    input: ResolveUserReportRecord,
  ): Promise<'ALREADY_RESOLVED' | 'NOT_FOUND' | UserReportRecord> {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.userReport.findUnique({
        select: { status: true },
        where: { id: input.reportId },
      });
      if (!current) {
        return 'NOT_FOUND';
      }
      if (current.status === PrismaUserReportStatus.RESOLVED) {
        return 'ALREADY_RESOLVED';
      }

      const changed = await transaction.userReport.updateMany({
        data: {
          resolvedAt: input.resolvedAt,
          resolvedByAdminId: input.resolvedByAdminId,
          status: PrismaUserReportStatus.RESOLVED,
        },
        where: { id: input.reportId, status: PrismaUserReportStatus.OPEN },
      });
      if (changed.count !== 1) {
        return 'ALREADY_RESOLVED';
      }

      const report = await transaction.userReport.findUniqueOrThrow({
        select: reportSelection,
        where: { id: input.reportId },
      });
      return this.toDomain(report);
    });
  }

  private toDomain(report: PrismaReport): UserReportRecord {
    return {
      ...report,
      status:
        report.status === PrismaUserReportStatus.OPEN
          ? UserReportStatus.Open
          : UserReportStatus.Resolved,
    };
  }
}
