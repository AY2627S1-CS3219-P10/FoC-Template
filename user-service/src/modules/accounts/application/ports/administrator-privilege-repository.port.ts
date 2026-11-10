/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of administrator privilege repository port code (AdministratorPrivilegeAccount, ChangeAdministratorPrivilegeRecord, AdministratorPrivilegeRepositoryPort).
 * Author review: Checked existing AdministratorPrivilegeAccount, ChangeAdministratorPrivilegeRecord parameter and return types against their callers; edited type declaration layout and member naming.
 */

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
