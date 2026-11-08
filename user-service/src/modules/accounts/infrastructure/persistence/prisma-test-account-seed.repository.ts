import { TestAccountSeedError } from '../../application/errors/test-account-seed.error.js';
import type {
  TestAccountSeedRecord,
  TestAccountSeedRepositoryPort,
  TestAccountSeedResult,
} from '../../application/ports/test-account-seed-repository.port.js';
import {
  Prisma,
  type PrismaClient,
  UserStatus,
} from '../../../../generated/prisma/client.js';

export class PrismaTestAccountSeedRepository implements TestAccountSeedRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async seedTestAccounts(
    records: TestAccountSeedRecord[],
  ): Promise<TestAccountSeedResult> {
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const existingAccounts = await transaction.user.findMany({
            select: {
              email: true,
              emailVerifiedAt: true,
              id: true,
              isAdmin: true,
              phoneNumber: true,
              status: true,
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
              (!exactMatch ||
                matches.length > 1 ||
                exactMatch.isAdmin ||
                exactMatch.status !== UserStatus.ACTIVE ||
                exactMatch.emailVerifiedAt === null)
            ) {
              throw new TestAccountSeedError(
                'Test account seed identity conflicts with an existing account.',
              );
            }

            if (exactMatch) {
              existingCount += 1;
              continue;
            }

            await transaction.user.create({
              data: {
                email: record.email,
                emailVerifiedAt: record.emailVerifiedAt,
                id: record.id,
                isAdmin: false,
                passwordHash: record.passwordHash,
                phoneNumber: record.phoneNumber,
                status: UserStatus.ACTIVE,
                username: record.username,
              },
            });
            await transaction.outboxEvent.create({
              data: {
                aggregateId: record.id,
                aggregateType: 'user',
                eventType: 'user.verified.v1',
                id: record.eventId,
                payload: { userId: record.id },
              },
            });
            createdCount += 1;
          }

          return { createdCount, existingCount };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      if (error instanceof TestAccountSeedError) {
        throw error;
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2034')
      ) {
        throw new TestAccountSeedError(
          'Test account seeding conflicted with existing or concurrent data.',
        );
      }

      throw error;
    }
  }
}
