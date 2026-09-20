import { AdministratorPrivilegeError } from '../../application/errors/administrator-privilege.error.js';
import type {
  AdministratorPrivilegeAccount,
  AdministratorPrivilegeRepositoryPort,
  ChangeAdministratorPrivilegeRecord,
} from '../../application/ports/administrator-privilege-repository.port.js';
import {
  Prisma,
  type PrismaClient,
  UserStatus,
} from '../../../../generated/prisma/client.js';

const LAST_ADMINISTRATOR_CONSTRAINT =
  'users_require_at_least_one_administrator';

export class PrismaAdministratorPrivilegeRepository implements AdministratorPrivilegeRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async changeAdministratorPrivilege(
    input: ChangeAdministratorPrivilegeRecord,
  ): Promise<AdministratorPrivilegeAccount | null> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT pg_advisory_xact_lock(3219, 1)`;

        const actor = await transaction.user.findUnique({
          select: { isAdmin: true, status: true },
          where: { id: input.actorUserId },
        });

        if (!actor?.isAdmin || actor.status !== UserStatus.ACTIVE) {
          throw new AdministratorPrivilegeError(
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

        if (target.isAdmin === input.isAdmin) {
          return target;
        }

        if (!input.isAdmin) {
          const otherAdministratorCount = await transaction.user.count({
            where: { id: { not: target.id }, isAdmin: true },
          });

          if (otherAdministratorCount === 0) {
            throw this.lastAdministratorError();
          }
        }

        const updated = await transaction.user.update({
          data: { isAdmin: input.isAdmin },
          select: { id: true, isAdmin: true, username: true },
          where: { id: target.id },
        });
        await transaction.session.updateMany({
          data: { revokedAt: input.changedAt },
          where: { revokedAt: null, userId: target.id },
        });

        return updated;
      });
    } catch (error: unknown) {
      if (error instanceof AdministratorPrivilegeError) {
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

  private lastAdministratorError(): AdministratorPrivilegeError {
    return new AdministratorPrivilegeError(
      'LAST_ADMINISTRATOR_REQUIRED',
      'The system must retain at least one administrator.',
    );
  }
}
