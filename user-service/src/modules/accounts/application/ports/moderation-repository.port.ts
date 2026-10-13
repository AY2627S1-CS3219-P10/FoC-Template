export type ReportStatus = 'OPEN' | 'RESOLVED';
export interface ReportIdentity {
  id: string;
  username: string;
}
export interface UserReport {
  id: string;
  reporterUserId: string;
  reportedUserId: string;
  reporter: ReportIdentity;
  reportedUser: ReportIdentity;
  description: string;
  status: ReportStatus;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  resolvedBy: ReportIdentity | null;
}
export interface SuspendAccountRecord {
  actorUserId: string;
  targetUserId: string;
  suspendedUntil: Date;
  changedAt: Date;
}
export interface SuspendedAccount {
  id: string;
  username: string;
  suspendedUntil: Date;
}
export interface ListReportsInput {
  status?: ReportStatus;
  limit: number;
  offset: number;
}
export interface ModerationRepositoryPort {
  createReport(input: {
    reporterUserId: string;
    reportedUserId: string;
    description: string;
  }): Promise<UserReport | null>;
  listReports(input: ListReportsInput): Promise<UserReport[]>;
  findReport(id: string): Promise<UserReport | null>;
  resolveReport(input: {
    reportId: string;
    actorUserId: string;
    resolvedAt: Date;
  }): Promise<UserReport | null>;
  suspendAccount(input: SuspendAccountRecord): Promise<SuspendedAccount | null>;
}
