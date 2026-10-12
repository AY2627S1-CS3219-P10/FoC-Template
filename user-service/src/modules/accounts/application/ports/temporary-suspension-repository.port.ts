export interface TemporarySuspensionAccount {
  id: string;
  suspendedUntil: Date;
  username: string;
}

export interface SuspendAccountRecord {
  actorUserId: string;
  suspendedAt: Date;
  suspendedUntil: Date;
  targetUserId: string;
}

export interface TemporarySuspensionRepositoryPort {
  suspendAccount(
    input: SuspendAccountRecord,
  ): Promise<TemporarySuspensionAccount | null>;
}
