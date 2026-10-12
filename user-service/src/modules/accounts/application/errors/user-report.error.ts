export type UserReportErrorCode =
  | 'REPORT_ALREADY_RESOLVED'
  | 'REPORT_NOT_FOUND'
  | 'REPORTED_ACCOUNT_NOT_FOUND'
  | 'SELF_REPORT_FORBIDDEN';

export class UserReportError extends Error {
  constructor(
    public readonly code: UserReportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'UserReportError';
  }
}
