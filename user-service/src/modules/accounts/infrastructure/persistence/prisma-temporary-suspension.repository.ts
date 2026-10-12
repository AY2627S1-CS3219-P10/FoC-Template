import { TemporarySuspensionError } from '../../application/errors/temporary-suspension.error.js';
import type {
  SuspendAccountRecord,
  TemporarySuspensionAccount,
  TemporarySuspensionRepositoryPort,
} from '../../application/ports/temporary-suspension-repository.port.js';
import {
  Prisma,
  type PrismaClient,
  UserStatus,
} from '../../../../generated/prisma/client.js';

const LAST_ADMINISTRATOR_CONSTRAINT =
  'users_require_at_least_one_administrator';

export class PrismaTemporarySuspensionRepository implements TemporarySuspensionRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async suspendAccount(
    input: SuspendAccountRecord,
  ): Promise<TemporarySuspensionAccount | null> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(3219, 1)`;

        const actor = await transaction.user.findUnique({
          select: { isAdmin: true, status: true, suspendedUntil: true },
          where: { id: input.actorUserId },
        });
        if (
          !actor?.isAdmin ||
          actor.status !== UserStatus.ACTIVE ||
          (actor.suspendedUntil !== null &&
            actor.suspendedUntil > input.suspendedAt)
        ) {
          throw new TemporarySuspensionError(
            'ADMINISTRATOR_PRIVILEGES_REQUIRED',
            'Administrator privileges are required.',
          );
        }

        const target = await transaction.user.findUnique({
          select: { id: true, isAdmin: true, username: true },
          where: { id: input.targetUserId },
        });
        if (!target) {
          return null;
        }

        if (target.isAdmin) {
          const otherUsableAdministrators = await transaction.user.count({
            where: {
              id: { not: target.id },
              isAdmin: true,
              status: UserStatus.ACTIVE,
              OR: [
                { suspendedUntil: null },
                { suspendedUntil: { lte: input.suspendedAt } },
              ],
            },
          });
          if (otherUsableAdministrators === 0) {
            throw this.lastAdministratorError();
          }
        }

        const updated = await transaction.user.update({
          data: { suspendedUntil: input.suspendedUntil },
          select: { id: true, suspendedUntil: true, username: true },
          where: { id: target.id },
        });
        await transaction.session.updateMany({
          data: { revokedAt: input.suspendedAt },
          where: { revokedAt: null, userId: target.id },
        });

        return { ...updated, suspendedUntil: updated.suspendedUntil! };
      });
    } catch (error: unknown) {
      if (error instanceof TemporarySuspensionError) {
        throw error;
      }
      if (this.isLastAdministratorConstraintError(error)) {
        throw this.lastAdministratorError();
      }
      throw error;
    }
  }

  private isLastAdministratorConstraintError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }
    const details =
      error instanceof Prisma.PrismaClientKnownRequestError
        ? `${error.message} ${JSON.stringify(error.meta ?? {})}`
        : error.message;
    return details.includes(LAST_ADMINISTRATOR_CONSTRAINT);
  }

  private lastAdministratorError(): TemporarySuspensionError {
    return new TemporarySuspensionError(
      'LAST_ADMINISTRATOR_REQUIRED',
      'The system must retain at least one usable administrator.',
    );
  }
}
