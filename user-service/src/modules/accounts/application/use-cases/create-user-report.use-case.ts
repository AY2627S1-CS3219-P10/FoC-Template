import { UserReportError } from '../errors/user-report.error.js';
import type { ClockPort } from '../ports/clock.port.js';
import type { IdGeneratorPort } from '../ports/id-generator.port.js';
import type {
  UserReportRecord,
  UserReportRepositoryPort,
} from '../ports/user-report-repository.port.js';
import { ReportDescription } from '../../domain/report-description.js';

export interface CreateUserReportInput {
  description: string;
  reportedUserId: string;
  reporterUserId: string;
}

export interface CreateUserReportDependencies {
  clock: ClockPort;
  idGenerator: IdGeneratorPort;
  repository: Pick<UserReportRepositoryPort, 'createReport'>;
}

export class CreateUserReportUseCase {
  constructor(private readonly dependencies: CreateUserReportDependencies) {}

  async execute(input: CreateUserReportInput): Promise<UserReportRecord> {
    if (input.reporterUserId === input.reportedUserId) {
      throw new UserReportError(
        'SELF_REPORT_FORBIDDEN',
        'Users cannot report themselves.',
      );
    }

    const report = await this.dependencies.repository.createReport({
      createdAt: this.dependencies.clock.now(),
      description: ReportDescription.create(input.description).value,
      id: this.dependencies.idGenerator.generate(),
      reportedUserId: input.reportedUserId,
      reporterUserId: input.reporterUserId,
    });

    if (!report) {
      throw new UserReportError(
        'REPORTED_ACCOUNT_NOT_FOUND',
        'The reported account does not exist.',
      );
    }

    return report;
  }
}
