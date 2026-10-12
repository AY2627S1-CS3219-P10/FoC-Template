import { TemporarySuspensionError } from '../errors/temporary-suspension.error.js';
import type { ClockPort } from '../ports/clock.port.js';
import type {
  TemporarySuspensionAccount,
  TemporarySuspensionRepositoryPort,
} from '../ports/temporary-suspension-repository.port.js';

export class SuspendAccountUseCase {
  constructor(
    private readonly dependencies: {
      clock: ClockPort;
      repository: TemporarySuspensionRepositoryPort;
    },
  ) {}

  async execute(input: {
    actorUserId: string;
    suspendedUntil: Date;
    targetUserId: string;
  }): Promise<TemporarySuspensionAccount> {
    if (input.actorUserId === input.targetUserId) {
      throw new TemporarySuspensionError(
        'SELF_SUSPENSION_FORBIDDEN',
        'Administrators cannot suspend themselves.',
      );
    }

    const now = this.dependencies.clock.now();
    if (
      Number.isNaN(input.suspendedUntil.getTime()) ||
      input.suspendedUntil <= now
    ) {
      throw new TemporarySuspensionError(
        'SUSPENSION_EXPIRY_INVALID',
        'Suspension expiry must be a valid future date and time.',
      );
    }

    const account = await this.dependencies.repository.suspendAccount({
      ...input,
      suspendedAt: now,
    });

    if (!account) {
      throw new TemporarySuspensionError(
        'ACCOUNT_NOT_FOUND',
        'The requested account does not exist.',
      );
    }

    return account;
  }
}
