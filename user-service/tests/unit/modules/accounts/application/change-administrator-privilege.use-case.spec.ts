import type {
  AdministratorPrivilegeAccount,
  AdministratorPrivilegeRepositoryPort,
  ChangeAdministratorPrivilegeRecord,
} from '../../../../../src/modules/accounts/application/ports/administrator-privilege-repository.port.js';
import type { ClockPort } from '../../../../../src/modules/accounts/application/ports/clock.port.js';
import { ChangeAdministratorPrivilegeUseCase } from '../../../../../src/modules/accounts/application/use-cases/change-administrator-privilege.use-case.js';

const NOW = new Date('2026-09-20T08:00:00.000Z');
const ACTOR_ID = '4a84f480-b1cb-4b81-b632-8bb49034b9e7';
const TARGET_ID = '77af9009-08e1-42f5-91d3-516920f0c571';

class FixedClock implements ClockPort {
  now(): Date {
    return NOW;
  }
}

class StubRepository implements AdministratorPrivilegeRepositoryPort {
  inputs: ChangeAdministratorPrivilegeRecord[] = [];
  result: AdministratorPrivilegeAccount | null = {
    id: TARGET_ID,
    isAdmin: true,
    username: 'TargetUser',
  };

  changeAdministratorPrivilege(
    input: ChangeAdministratorPrivilegeRecord,
  ): Promise<AdministratorPrivilegeAccount | null> {
    this.inputs.push(input);
    return Promise.resolve(this.result);
  }
}

describe('ChangeAdministratorPrivilegeUseCase', () => {
  it('delegates a promotion with an authoritative change timestamp', async () => {
    const repository = new StubRepository();
    const useCase = new ChangeAdministratorPrivilegeUseCase({
      clock: new FixedClock(),
      repository,
    });

    await expect(
      useCase.execute({
        actorUserId: ACTOR_ID,
        isAdmin: true,
        targetUserId: TARGET_ID,
      }),
    ).resolves.toEqual(repository.result);
    expect(repository.inputs).toEqual([
      {
        actorUserId: ACTOR_ID,
        changedAt: NOW,
        isAdmin: true,
        targetUserId: TARGET_ID,
      },
    ]);
  });

  it('rejects self-service privilege changes before persistence', async () => {
    const repository = new StubRepository();
    const useCase = new ChangeAdministratorPrivilegeUseCase({
      clock: new FixedClock(),
      repository,
    });

    await expect(
      useCase.execute({
        actorUserId: ACTOR_ID,
        isAdmin: false,
        targetUserId: ACTOR_ID,
      }),
    ).rejects.toMatchObject({
      code: 'ADMINISTRATOR_SELF_CHANGE_FORBIDDEN',
    });
    expect(repository.inputs).toHaveLength(0);
  });

  it('reports an unknown target account', async () => {
    const repository = new StubRepository();
    repository.result = null;
    const useCase = new ChangeAdministratorPrivilegeUseCase({
      clock: new FixedClock(),
      repository,
    });

    await expect(
      useCase.execute({
        actorUserId: ACTOR_ID,
        isAdmin: true,
        targetUserId: TARGET_ID,
      }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_NOT_FOUND' });
  });
});
