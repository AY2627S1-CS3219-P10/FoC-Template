import { AdministratorSeedError } from '../../application/errors/administrator-seed.error.js';
import type {
  AdministratorSeedRecord,
  AdministratorSeedRepositoryPort,
  AdministratorSeedResult,
} from '../../application/ports/administrator-seed-repository.port.js';
import {
  Prisma,
  type PrismaClient,
  UserStatus,
} from '../../../../generated/prisma/client.js';

export class PrismaAdministratorSeedRepository implements AdministratorSeedRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async seedAdministrators(
    records: AdministratorSeedRecord[],
  ): Promise<AdministratorSeedResult> {
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const existingAccounts = await transaction.user.findMany({
            select: {
              email: true,
              id: true,
              isAdmin: true,
              phoneNumber: true,
              username: true,
            },
            where: {
              OR: [
                { email: { in: records.map((record) => record.email) } },
                {
                  phoneNumber: {
                    in: records.map((record) => record.phoneNumber),
                  },
                },
                { username: { in: records.map((record) => record.username) } },
              ],
            },
          });

          let createdCount = 0;
          let existingCount = 0;

          for (const record of records) {
            const matches = existingAccounts.filter(
              (account) =>
                account.email.toLowerCase() === record.email.toLowerCase() ||
                account.phoneNumber === record.phoneNumber ||
                account.username.toLowerCase() ===
                  record.username.toLowerCase(),
            );
            const exactMatch = matches.find(
              (account) =>
                account.email.toLowerCase() === record.email.toLowerCase() &&
                account.phoneNumber === record.phoneNumber &&
                account.username.toLowerCase() ===
                  record.username.toLowerCase(),
            );

            if (
              matches.length > 0 &&
              (!exactMatch || matches.length > 1 || !exactMatch.isAdmin)
            ) {
              throw new AdministratorSeedError(
                'Administrator seed identity conflicts with an existing account.',
              );
            }

            if (exactMatch) {
              existingCount += 1;
              continue;
            }

            await transaction.user.create({
              data: {
                ...record,
                status: UserStatus.ACTIVE,
              },
            });
            createdCount += 1;
          }

          return { createdCount, existingCount };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      if (error instanceof AdministratorSeedError) {
        throw error;
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2034')
      ) {
        throw new AdministratorSeedError(
          'Administrator seeding conflicted with existing or concurrent data.',
        );
      }

      throw error;
    }
  }
}
