import type {
  UserReportRecord,
  UserReportRepositoryPort,
} from '../ports/user-report-repository.port.js';

export class ListUserReportsUseCase {
  constructor(
    private readonly repository: Pick<UserReportRepositoryPort, 'listReports'>,
  ) {}

  execute(): Promise<UserReportRecord[]> {
    return this.repository.listReports();
  }
}
