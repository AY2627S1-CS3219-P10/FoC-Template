ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'ADJUST_RESERVE';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'ADJUST_RELEASE';

ALTER TABLE "ledger_entries"
ADD COLUMN "correlation_id" TEXT;

ALTER TABLE "ledger_entries" DISABLE TRIGGER "ledger_entries_immutable";

UPDATE "ledger_entries"
SET "correlation_id" = 'legacy:' || "ledger_entry_id"::TEXT
WHERE "correlation_id" IS NULL;

ALTER TABLE "ledger_entries" ENABLE TRIGGER "ledger_entries_immutable";

ALTER TABLE "ledger_entries"
ALTER COLUMN "correlation_id" SET NOT NULL,
ADD CONSTRAINT "ledger_entries_correlation_id_length"
CHECK (char_length("correlation_id") BETWEEN 1 AND 128);

ALTER TABLE "ledger_entries"
DROP CONSTRAINT "ledger_entries_operation_link_consistent";

ALTER TABLE "ledger_entries"
ADD CONSTRAINT "ledger_entries_operation_link_consistent" CHECK (
  (
    "type"::TEXT = 'INITIALIZE'
    AND "reservation_id" IS NULL
    AND "errand_id" IS NULL
  )
  OR (
    "type"::TEXT IN (
      'RESERVE',
      'ADJUST_RESERVE',
      'ADJUST_RELEASE',
      'SETTLE',
      'RELEASE'
    )
    AND "reservation_id" IS NOT NULL
    AND "errand_id" IS NOT NULL
  )
);

CREATE TABLE "credit_reservation_adjustments" (
    "adjustment_id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "previous_amount" INTEGER NOT NULL,
    "target_amount" INTEGER NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "credit_reservation_adjustments_pkey" PRIMARY KEY ("adjustment_id"),
    CONSTRAINT "credit_reservation_adjustments_amounts_positive"
      CHECK ("previous_amount" > 0 AND "target_amount" > 0),
    CONSTRAINT "credit_reservation_adjustments_idempotency_key_length"
      CHECK (char_length("idempotency_key") BETWEEN 1 AND 128),
    CONSTRAINT "credit_reservation_adjustments_correlation_id_length"
      CHECK (char_length("correlation_id") BETWEEN 1 AND 128)
);

CREATE UNIQUE INDEX "credit_reservation_adjustments_reservation_id_idempotency_key_key"
ON "credit_reservation_adjustments"("reservation_id", "idempotency_key");

CREATE INDEX "credit_reservation_adjustments_reservation_id_created_at_idx"
ON "credit_reservation_adjustments"("reservation_id", "created_at");

ALTER TABLE "credit_reservation_adjustments"
ADD CONSTRAINT "credit_reservation_adjustments_reservation_id_fkey"
FOREIGN KEY ("reservation_id") REFERENCES "credit_reservations"("reservation_id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "credit_reservation_adjustments_immutable"
BEFORE UPDATE OR DELETE ON "credit_reservation_adjustments"
FOR EACH ROW
EXECUTE FUNCTION reject_ledger_entry_mutation();
