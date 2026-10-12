import type { ClockPort } from '../../../../../src/modules/accounts/application/ports/clock.port.js';
import type { IdGeneratorPort } from '../../../../../src/modules/accounts/application/ports/id-generator.port.js';
import type {
  CreateUserReportRecord,
  ResolveUserReportRecord,
  UserReportRecord,
  UserReportRepositoryPort,
} from '../../../../../src/modules/accounts/application/ports/user-report-repository.port.js';
import { UserReportStatus } from '../../../../../src/modules/accounts/application/ports/user-report-repository.port.js';
import type {
  SuspendAccountRecord,
  TemporarySuspensionAccount,
  TemporarySuspensionRepositoryPort,
} from '../../../../../src/modules/accounts/application/ports/temporary-suspension-repository.port.js';
import { CreateUserReportUseCase } from '../../../../../src/modules/accounts/application/use-cases/create-user-report.use-case.js';
import { ResolveUserReportUseCase } from '../../../../../src/modules/accounts/application/use-cases/resolve-user-report.use-case.js';
import { SuspendAccountUseCase } from '../../../../../src/modules/accounts/application/use-cases/suspend-account.use-case.js';

const NOW = new Date('2026-10-12T08:00:00.000Z');
const REPORTER_ID = '4a84f480-b1cb-4b81-b632-8bb49034b9e7';
const TARGET_ID = '77af9009-08e1-42f5-91d3-516920f0c571';
const REPORT_ID = '9fa02524-f606-4e1d-8cef-bfa0cf884e3e';

const REPORT: UserReportRecord = {
  createdAt: NOW,
  description: 'Repeated abusive messages',
  id: REPORT_ID,
  reportedUser: { id: TARGET_ID, username: 'TargetUser' },
  reporter: { id: REPORTER_ID, username: 'ReporterUser' },
  resolvedAt: null,
  status: UserReportStatus.Open,
  updatedAt: NOW,
};

class FixedClock implements ClockPort {
  now(): Date {
    return NOW;
  }
}

class FixedIdGenerator implements IdGeneratorPort {
  generate(): string {
    return REPORT_ID;
  }
}

class StubReportRepository implements UserReportRepositoryPort {
  createInput?: CreateUserReportRecord;
  createResult: UserReportRecord | null = REPORT;
  resolveInput?: ResolveUserReportRecord;
  resolveResult: 'ALREADY_RESOLVED' | 'NOT_FOUND' | UserReportRecord = REPORT;

  createReport(
    input: CreateUserReportRecord,
  ): Promise<UserReportRecord | null> {
    this.createInput = input;
    return Promise.resolve(this.createResult);
  }

  listReports(): Promise<UserReportRecord[]> {
    return Promise.resolve([REPORT]);
  }

  resolveReport(
    input: ResolveUserReportRecord,
  ): Promise<'ALREADY_RESOLVED' | 'NOT_FOUND' | UserReportRecord> {
    this.resolveInput = input;
    return Promise.resolve(this.resolveResult);
  }
}

class StubSuspensionRepository implements TemporarySuspensionRepositoryPort {
  input?: SuspendAccountRecord;

  suspendAccount(
    input: SuspendAccountRecord,
  ): Promise<TemporarySuspensionAccount> {
    this.input = input;
    return Promise.resolve({
      id: input.targetUserId,
      suspendedUntil: input.suspendedUntil,
      username: 'TargetUser',
    });
  }
}

describe('user report use cases', () => {
  it('creates a trimmed report for the authenticated reporter', async () => {
    const repository = new StubReportRepository();
    const useCase = new CreateUserReportUseCase({
      clock: new FixedClock(),
      idGenerator: new FixedIdGenerator(),
      repository,
    });

    await expect(
      useCase.execute({
        description: '  Repeated abusive messages  ',
        reportedUserId: TARGET_ID,
        reporterUserId: REPORTER_ID,
      }),
    ).resolves.toBe(REPORT);
    expect(repository.createInput).toEqual({
      createdAt: NOW,
      description: 'Repeated abusive messages',
      id: REPORT_ID,
      reportedUserId: TARGET_ID,
      reporterUserId: REPORTER_ID,
    });
  });

  it('rejects self-reporting before persistence', async () => {
    const repository = new StubReportRepository();
    const useCase = new CreateUserReportUseCase({
      clock: new FixedClock(),
      idGenerator: new FixedIdGenerator(),
      repository,
    });
    await expect(
      useCase.execute({
        description: 'Invalid report',
        reportedUserId: REPORTER_ID,
        reporterUserId: REPORTER_ID,
      }),
    ).rejects.toMatchObject({ code: 'SELF_REPORT_FORBIDDEN' });
    expect(repository.createInput).toBeUndefined();
  });

  it('reports a missing target and resolves an open report', async () => {
    const repository = new StubReportRepository();
    const create = new CreateUserReportUseCase({
      clock: new FixedClock(),
      idGenerator: new FixedIdGenerator(),
      repository,
    });
    repository.createResult = null;
    await expect(
      create.execute({
        description: 'Missing target',
        reportedUserId: TARGET_ID,
        reporterUserId: REPORTER_ID,
      }),
    ).rejects.toMatchObject({ code: 'REPORTED_ACCOUNT_NOT_FOUND' });

    const resolve = new ResolveUserReportUseCase({
      clock: new FixedClock(),
      repository,
    });
    await expect(
      resolve.execute({ reportId: REPORT_ID, resolvedByAdminId: REPORTER_ID }),
    ).resolves.toBe(REPORT);
    expect(repository.resolveInput).toEqual({
      reportId: REPORT_ID,
      resolvedAt: NOW,
      resolvedByAdminId: REPORTER_ID,
    });
  });
});

describe('temporary suspension use case', () => {
  it('suspends another account until a future instant', async () => {
    const repository = new StubSuspensionRepository();
    const useCase = new SuspendAccountUseCase({
      clock: new FixedClock(),
      repository,
    });
    const suspendedUntil = new Date(NOW.getTime() + 60_000);

    await expect(
      useCase.execute({
        actorUserId: REPORTER_ID,
        suspendedUntil,
        targetUserId: TARGET_ID,
      }),
    ).resolves.toMatchObject({ id: TARGET_ID, suspendedUntil });
    expect(repository.input).toEqual({
      actorUserId: REPORTER_ID,
      suspendedAt: NOW,
      suspendedUntil,
      targetUserId: TARGET_ID,
    });
  });

  it('rejects self-suspension and a non-future expiry', async () => {
    const repository = new StubSuspensionRepository();
    const useCase = new SuspendAccountUseCase({
      clock: new FixedClock(),
      repository,
    });
    await expect(
      useCase.execute({
        actorUserId: REPORTER_ID,
        suspendedUntil: new Date(NOW.getTime() + 60_000),
        targetUserId: REPORTER_ID,
      }),
    ).rejects.toMatchObject({ code: 'SELF_SUSPENSION_FORBIDDEN' });
    await expect(
      useCase.execute({
        actorUserId: REPORTER_ID,
        suspendedUntil: NOW,
        targetUserId: TARGET_ID,
      }),
    ).rejects.toMatchObject({ code: 'SUSPENSION_EXPIRY_INVALID' });
  });
});
