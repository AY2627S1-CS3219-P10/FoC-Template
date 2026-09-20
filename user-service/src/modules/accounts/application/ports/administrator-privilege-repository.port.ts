export interface AdministratorPrivilegeAccount {
  id: string;
  isAdmin: boolean;
  username: string;
}

export interface ChangeAdministratorPrivilegeRecord {
  actorUserId: string;
  changedAt: Date;
  isAdmin: boolean;
  targetUserId: string;
}

export interface AdministratorPrivilegeRepositoryPort {
  changeAdministratorPrivilege(
    input: ChangeAdministratorPrivilegeRecord,
  ): Promise<AdministratorPrivilegeAccount | null>;
}
