import type {
  ModerationRepositoryPort,
  UserReport,
} from '../../../../../src/modules/accounts/application/ports/moderation-repository.port.js';
import {
  ReportUserUseCase,
  ResolveReportUseCase,
  SuspendAccountUseCase,
  ViewReportsUseCase,
} from '../../../../../src/modules/accounts/application/use-cases/moderation.use-cases.js';
import { AccountStatus } from '../../../../../src/modules/accounts/domain/account-status.js';
import { effectiveAccountStatus } from '../../../../../src/modules/accounts/domain/temporary-suspension.js';

const now = new Date('2026-10-12T12:00:00Z');
const report: UserReport = {
  id: 'report-id',
  reporterUserId: 'actor',
  reportedUserId: 'target',
  reporter: { id: 'actor', username: 'Reporter' },
  reportedUser: { id: 'target', username: 'Target' },
  description: 'Issue',
  status: 'OPEN',
  createdAt: now,
  updatedAt: now,
  resolvedAt: null,
  resolvedBy: null,
};
class StubRepository implements ModerationRepositoryPort {
  reportResult: UserReport | null = report;
  findResult: UserReport | null = report;
  resolveResult: UserReport | null = report;
  createCalls: Parameters<ModerationRepositoryPort['createReport']>[0][] = [];
  suspendCalls: Parameters<ModerationRepositoryPort['suspendAccount']>[0][] =
    [];
  resolveCalls: Parameters<ModerationRepositoryPort['resolveReport']>[0][] = [];
  createReport(
    input: Parameters<ModerationRepositoryPort['createReport']>[0],
  ): ReturnType<ModerationRepositoryPort['createReport']> {
    this.createCalls.push(input);
    return Promise.resolve(this.reportResult);
  }
  listReports(): ReturnType<ModerationRepositoryPort['listReports']> {
    return Promise.resolve([report]);
  }
  findReport(): ReturnType<ModerationRepositoryPort['findReport']> {
    return Promise.resolve(this.findResult);
  }
  resolveReport(
    input: Parameters<ModerationRepositoryPort['resolveReport']>[0],
  ): ReturnType<ModerationRepositoryPort['resolveReport']> {
    this.resolveCalls.push(input);
    return Promise.resolve(this.resolveResult);
  }
  suspendAccount(
    input: Parameters<ModerationRepositoryPort['suspendAccount']>[0],
  ): ReturnType<ModerationRepositoryPort['suspendAccount']> {
    this.suspendCalls.push(input);
    return Promise.resolve({
      id: 'target',
      username: 'Target',
      suspendedUntil: input.suspendedUntil,
    });
  }
}
function repository(): StubRepository {
  return new StubRepository();
}
describe('moderation use cases', () => {
  it('creates a report with a trimmed reason', async () => {
    const repo = repository();
    await expect(
      new ReportUserUseCase(repo).execute({
        reporterUserId: 'actor',
        reportedUserId: 'target',
        description: ' Issue ',
      }),
    ).resolves.toEqual(report);
    expect(repo.createCalls[0]).toEqual({
      reporterUserId: 'actor',
      reportedUserId: 'target',
      description: 'Issue',
    });
  });
  it('rejects self-report before touching persistence', async () => {
    const repo = repository();
    await expect(
      new ReportUserUseCase(repo).execute({
        reporterUserId: 'actor',
        reportedUserId: 'actor',
        description: 'Issue',
      }),
    ).rejects.toMatchObject({ code: 'SELF_REPORT_FORBIDDEN' });
    expect(repo.createCalls).toEqual([]);
  });
  it.each(['', '  ', 'x'.repeat(501)])(
    'rejects an invalid description',
    async (description) => {
      await expect(
        new ReportUserUseCase(repository()).execute({
          reporterUserId: 'actor',
          reportedUserId: 'target',
          description,
        }),
      ).rejects.toMatchObject({ code: 'INVALID_REPORT_DESCRIPTION' });
    },
  );
  it('reports a missing target', async () => {
    const repo = repository();
    repo.reportResult = null;
    await expect(
      new ReportUserUseCase(repo).execute({
        reporterUserId: 'actor',
        reportedUserId: 'target',
        description: 'Issue',
      }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_NOT_FOUND' });
  });
  it('rejects self-suspension before touching persistence', async () => {
    const repo = repository();
    await expect(
      new SuspendAccountUseCase(repo, { now: () => now }).execute({
        actorUserId: 'actor',
        targetUserId: 'actor',
        suspendedUntil: new Date(now.getTime() + 1000),
      }),
    ).rejects.toMatchObject({ code: 'SELF_SUSPENSION_FORBIDDEN' });
    expect(repo.suspendCalls).toEqual([]);
  });
  it.each([new Date(NaN), now, new Date(now.getTime() - 1)])(
    'rejects an invalid expiry',
    async (suspendedUntil) => {
      await expect(
        new SuspendAccountUseCase(repository(), { now: () => now }).execute({
          actorUserId: 'actor',
          targetUserId: 'target',
          suspendedUntil,
        }),
      ).rejects.toMatchObject({ code: 'INVALID_SUSPENSION_EXPIRY' });
    },
  );
  it('passes the trusted clock and expiry into suspension persistence', async () => {
    const repo = repository();
    const suspendedUntil = new Date(now.getTime() + 1000);
    await new SuspendAccountUseCase(repo, { now: () => now }).execute({
      actorUserId: 'actor',
      targetUserId: 'target',
      suspendedUntil,
    });
    expect(repo.suspendCalls[0]).toEqual({
      actorUserId: 'actor',
      targetUserId: 'target',
      suspendedUntil,
      changedAt: now,
    });
  });
  it('resolves using the authenticated admin and trusted timestamp', async () => {
    const repo = repository();
    await new ResolveReportUseCase(repo, { now: () => now }).execute({
      reportId: report.id,
      actorUserId: 'actor',
    });
    expect(repo.resolveCalls[0]).toEqual({
      reportId: report.id,
      actorUserId: 'actor',
      resolvedAt: now,
    });
  });
  it('reports missing reports on view and resolution', async () => {
    const repo = repository();
    repo.findResult = null;
    repo.resolveResult = null;
    await expect(
      new ViewReportsUseCase(repo).find('missing'),
    ).rejects.toMatchObject({ code: 'REPORT_NOT_FOUND' });
    await expect(
      new ResolveReportUseCase(repo, { now: () => now }).execute({
        reportId: 'missing',
        actorUserId: 'actor',
      }),
    ).rejects.toMatchObject({ code: 'REPORT_NOT_FOUND' });
  });
  it('becomes active exactly at expiry and preserves permanent statuses', () => {
    const future = new Date(now.getTime() + 1000);
    expect(effectiveAccountStatus(AccountStatus.Active, future, now)).toBe(
      AccountStatus.Suspended,
    );
    expect(effectiveAccountStatus(AccountStatus.Active, now, now)).toBe(
      AccountStatus.Active,
    );
    for (const status of [
      AccountStatus.Banned,
      AccountStatus.PendingVerification,
      AccountStatus.Suspended,
    ])
      expect(
        effectiveAccountStatus(status, new Date(now.getTime() - 1), now),
      ).toBe(status);
  });
});
