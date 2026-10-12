import { UserReportError } from '../errors/user-report.error.js';
import type { ClockPort } from '../ports/clock.port.js';
import type {
  UserReportRecord,
  UserReportRepositoryPort,
} from '../ports/user-report-repository.port.js';

export class ResolveUserReportUseCase {
  constructor(
    private readonly dependencies: {
      clock: ClockPort;
      repository: Pick<UserReportRepositoryPort, 'resolveReport'>;
    },
  ) {}

  async execute(input: {
    reportId: string;
    resolvedByAdminId: string;
  }): Promise<UserReportRecord> {
    const result = await this.dependencies.repository.resolveReport({
      ...input,
      resolvedAt: this.dependencies.clock.now(),
    });

    if (result === 'NOT_FOUND') {
      throw new UserReportError('REPORT_NOT_FOUND', 'Report does not exist.');
    }

    if (result === 'ALREADY_RESOLVED') {
      throw new UserReportError(
        'REPORT_ALREADY_RESOLVED',
        'Report has already been resolved.',
      );
    }

    return result;
  }
}
