ALTER TABLE "credit_reservations"
RENAME COLUMN "id" TO "reservation_id";

ALTER TABLE "credit_ledger_entries"
RENAME TO "ledger_entries";

ALTER TABLE "ledger_entries"
RENAME COLUMN "id" TO "ledger_entry_id";

ALTER TABLE "ledger_entries"
ADD COLUMN "errand_id" UUID;

UPDATE "ledger_entries" AS ledger
SET "errand_id" = reservation."errand_id"
FROM "credit_reservations" AS reservation
WHERE ledger."reservation_id" = reservation."reservation_id";

ALTER TABLE "ledger_entries"
ALTER COLUMN "type" TYPE TEXT USING "type"::TEXT;

DROP TYPE "LedgerEntryType";

UPDATE "ledger_entries"
SET "type" = CASE "type"
  WHEN 'INITIAL_CREDIT' THEN 'INITIALIZE'
  WHEN 'RESERVATION' THEN 'RESERVE'
  WHEN 'TRANSFER_DEBIT' THEN 'SETTLE'
  WHEN 'TRANSFER_CREDIT' THEN 'SETTLE'
  ELSE "type"
END;

CREATE TYPE "LedgerEntryType" AS ENUM (
  'INITIALIZE',
  'RESERVE',
  'SETTLE',
  'RELEASE'
);

ALTER TABLE "ledger_entries"
ALTER COLUMN "type" TYPE "LedgerEntryType"
USING "type"::"LedgerEntryType";

ALTER TABLE "ledger_entries"
ADD CONSTRAINT "ledger_entries_operation_link_consistent" CHECK (
  (
    "type" = 'INITIALIZE'
    AND "reservation_id" IS NULL
    AND "errand_id" IS NULL
  )
  OR (
    "type" IN ('RESERVE', 'SETTLE', 'RELEASE')
    AND "reservation_id" IS NOT NULL
    AND "errand_id" IS NOT NULL
  )
);

ALTER TABLE "ledger_entries"
RENAME CONSTRAINT "credit_ledger_entries_pkey"
TO "ledger_entries_pkey";

ALTER INDEX "credit_ledger_entries_reference_key_key"
RENAME TO "ledger_entries_reference_key_key";

ALTER INDEX "credit_ledger_entries_account_user_id_created_at_idx"
RENAME TO "ledger_entries_account_user_id_created_at_idx";

ALTER INDEX "credit_ledger_entries_reservation_id_idx"
RENAME TO "ledger_entries_reservation_id_idx";

ALTER INDEX "credit_ledger_entries_created_at_idx"
RENAME TO "ledger_entries_created_at_idx";

CREATE INDEX "ledger_entries_errand_id_idx"
ON "ledger_entries"("errand_id");

ALTER TABLE "ledger_entries"
RENAME CONSTRAINT "credit_ledger_entries_account_user_id_fkey"
TO "ledger_entries_account_user_id_fkey";

ALTER TABLE "ledger_entries"
RENAME CONSTRAINT "credit_ledger_entries_reservation_id_fkey"
TO "ledger_entries_reservation_id_fkey";

CREATE FUNCTION reject_ledger_entry_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ledger entries are immutable';
END;
$$;

CREATE TRIGGER "ledger_entries_immutable"
BEFORE UPDATE OR DELETE ON "ledger_entries"
FOR EACH ROW
EXECUTE FUNCTION reject_ledger_entry_mutation();
