import type {
  AdministratorAccountDiscoveryRepositoryPort,
  AdministratorAccountSummary,
  FindAdministratorAccountsInput,
} from '../../application/ports/administrator-account-discovery-repository.port.js';
import { AccountStatus } from '../../domain/account-status.js';
import {
  type PrismaClient,
  UserStatus,
} from '../../../../generated/prisma/client.js';

const DOMAIN_STATUS_BY_PRISMA: Record<UserStatus, AccountStatus> = {
  [UserStatus.ACTIVE]: AccountStatus.Active,
  [UserStatus.BANNED]: AccountStatus.Banned,
  [UserStatus.PENDING_VERIFICATION]: AccountStatus.PendingVerification,
  [UserStatus.SUSPENDED]: AccountStatus.Suspended,
};

export class PrismaAdministratorAccountDiscoveryRepository implements AdministratorAccountDiscoveryRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async findAccounts(
    input: FindAdministratorAccountsInput,
  ): Promise<AdministratorAccountSummary[]> {
    const accounts = await this.prisma.user.findMany({
      orderBy: [{ username: 'asc' }, { id: 'asc' }],
      select: {
        email: true,
        id: true,
        isAdmin: true,
        status: true,
        username: true,
      },
      take: input.limit,
      where: input.search
        ? {
            OR: [
              {
                username: {
                  contains: input.search,
                  mode: 'insensitive',
                },
              },
              {
                email: {
                  contains: input.search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : undefined,
    });

    return accounts.map((account) => ({
      ...account,
      status: DOMAIN_STATUS_BY_PRISMA[account.status],
    }));
  }
}
