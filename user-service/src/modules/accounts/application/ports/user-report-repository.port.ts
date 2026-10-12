export enum UserReportStatus {
  Open = 'OPEN',
  Resolved = 'RESOLVED',
}

export interface UserReportAccountSummary {
  id: string;
  username: string;
}

export interface UserReportRecord {
  createdAt: Date;
  description: string;
  id: string;
  reportedUser: UserReportAccountSummary;
  reporter: UserReportAccountSummary;
  resolvedAt: Date | null;
  status: UserReportStatus;
  updatedAt: Date;
}

export interface CreateUserReportRecord {
  createdAt: Date;
  description: string;
  id: string;
  reportedUserId: string;
  reporterUserId: string;
}

export interface ResolveUserReportRecord {
  reportId: string;
  resolvedAt: Date;
  resolvedByAdminId: string;
}

export interface UserReportRepositoryPort {
  createReport(input: CreateUserReportRecord): Promise<UserReportRecord | null>;
  listReports(): Promise<UserReportRecord[]>;
  resolveReport(
    input: ResolveUserReportRecord,
  ): Promise<'ALREADY_RESOLVED' | 'NOT_FOUND' | UserReportRecord>;
}
