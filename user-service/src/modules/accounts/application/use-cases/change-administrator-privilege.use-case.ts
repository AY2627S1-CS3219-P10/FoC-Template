/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of change administrator privilege code (ChangeAdministratorPrivilegeInput, ChangeAdministratorPrivilegeDependencies, ChangeAdministratorPrivilegeUseCase).
 * Author review: Validated ChangeAdministratorPrivilegeInput, ChangeAdministratorPrivilegeDependencies input handling, dependency calls, and success/error return paths; clarified local naming and control-flow formatting.
 */

import { AdministratorPrivilegeError } from '../errors/administrator-privilege.error.js';
import type {
  AdministratorPrivilegeAccount,
  AdministratorPrivilegeRepositoryPort,
} from '../ports/administrator-privilege-repository.port.js';
import type { ClockPort } from '../ports/clock.port.js';

export interface ChangeAdministratorPrivilegeInput {
  actorUserId: string;
  isAdmin: boolean;
  targetUserId: string;
}

export interface ChangeAdministratorPrivilegeDependencies {
  clock: ClockPort;
  repository: AdministratorPrivilegeRepositoryPort;
}

export class ChangeAdministratorPrivilegeUseCase {
  constructor(
    private readonly dependencies: ChangeAdministratorPrivilegeDependencies,
  ) {}

  async execute(
    input: ChangeAdministratorPrivilegeInput,
  ): Promise<AdministratorPrivilegeAccount> {
    if (input.actorUserId === input.targetUserId) {
      throw new AdministratorPrivilegeError(
        'ADMINISTRATOR_SELF_CHANGE_FORBIDDEN',
        'Administrators cannot change their own administrator status.',
      );
    }

    const account =
      await this.dependencies.repository.changeAdministratorPrivilege({
        ...input,
        changedAt: this.dependencies.clock.now(),
      });

    if (!account) {
      throw new AdministratorPrivilegeError(
        'ACCOUNT_NOT_FOUND',
        'The requested account does not exist.',
      );
    }

    return account;
  }
}
