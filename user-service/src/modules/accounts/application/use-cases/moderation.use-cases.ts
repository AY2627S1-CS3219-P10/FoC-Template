import { ModerationError } from '../errors/moderation.error.js';
import type { ClockPort } from '../ports/clock.port.js';
import type {
  ListReportsInput,
  ModerationRepositoryPort,
  UserReport,
  SuspendedAccount,
} from '../ports/moderation-repository.port.js';

export class ReportUserUseCase {
  constructor(private readonly repository: ModerationRepositoryPort) {}
  async execute(input: {
    reporterUserId: string;
    reportedUserId: string;
    description: string;
  }): Promise<UserReport> {
    if (input.reporterUserId === input.reportedUserId)
      throw new ModerationError(
        'SELF_REPORT_FORBIDDEN',
        'You cannot report yourself.',
      );
    const description = input.description.trim();
    if (!description || description.length > 500)
      throw new ModerationError(
        'INVALID_REPORT_DESCRIPTION',
        'Description must contain 1 to 500 characters.',
      );
    const report = await this.repository.createReport({
      ...input,
      description,
    });
    if (!report)
      throw new ModerationError(
        'ACCOUNT_NOT_FOUND',
        'The reported account does not exist.',
      );
    return report;
  }
}
export class ViewReportsUseCase {
  constructor(private readonly repository: ModerationRepositoryPort) {}
  list(input: ListReportsInput): Promise<UserReport[]> {
    return this.repository.listReports(input);
  }
  async find(id: string): Promise<UserReport> {
    const report = await this.repository.findReport(id);
    if (!report)
      throw new ModerationError(
        'REPORT_NOT_FOUND',
        'The report does not exist.',
      );
    return report;
  }
}
export class ResolveReportUseCase {
  constructor(
    private readonly repository: ModerationRepositoryPort,
    private readonly clock: ClockPort,
  ) {}
  async execute(input: {
    reportId: string;
    actorUserId: string;
  }): Promise<UserReport> {
    const report = await this.repository.resolveReport({
      ...input,
      resolvedAt: this.clock.now(),
    });
    if (!report)
      throw new ModerationError(
        'REPORT_NOT_FOUND',
        'The report does not exist.',
      );
    return report;
  }
}
export class SuspendAccountUseCase {
  constructor(
    private readonly repository: ModerationRepositoryPort,
    private readonly clock: ClockPort,
  ) {}
  async execute(input: {
    actorUserId: string;
    targetUserId: string;
    suspendedUntil: Date;
  }): Promise<SuspendedAccount> {
    if (input.actorUserId === input.targetUserId)
      throw new ModerationError(
        'SELF_SUSPENSION_FORBIDDEN',
        'Administrators cannot suspend themselves.',
      );
    const changedAt = this.clock.now();
    if (
      !Number.isFinite(input.suspendedUntil.getTime()) ||
      input.suspendedUntil <= changedAt
    )
      throw new ModerationError(
        'INVALID_SUSPENSION_EXPIRY',
        'Suspension expiry must be a future date/time.',
      );
    const account = await this.repository.suspendAccount({
      ...input,
      changedAt,
    });
    if (!account)
      throw new ModerationError(
        'ACCOUNT_NOT_FOUND',
        'The target account does not exist.',
      );
    return account;
  }
}
