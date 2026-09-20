import type { AccountStatus } from '../../domain/account-status.js';

export interface AdministratorSeedRecord {
  email: string;
  emailVerifiedAt: Date;
  id: string;
  isAdmin: true;
  passwordHash: string;
  phoneNumber: string;
  status: AccountStatus.Active;
  username: string;
}

export interface AdministratorSeedResult {
  createdCount: number;
  existingCount: number;
}

export interface AdministratorSeedRepositoryPort {
  seedAdministrators(
    records: AdministratorSeedRecord[],
  ): Promise<AdministratorSeedResult>;
}
