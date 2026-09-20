CREATE TYPE "ReservationStatus" AS ENUM ('RESERVED', 'SETTLED', 'RELEASED');
CREATE TYPE "LedgerEntryType" AS ENUM ('INITIAL_CREDIT', 'RESERVATION', 'RELEASE', 'TRANSFER_DEBIT', 'TRANSFER_CREDIT');

CREATE TABLE "credit_accounts" (
    "user_id" UUID NOT NULL,
    "available_credits" INTEGER NOT NULL DEFAULT 0,
    "reserved_credits" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "credit_accounts_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "credit_accounts_available_nonnegative" CHECK ("available_credits" >= 0),
    CONSTRAINT "credit_accounts_reserved_nonnegative" CHECK ("reserved_credits" >= 0)
);

CREATE TABLE "credit_reservations" (
    "id" UUID NOT NULL,
    "errand_id" UUID NOT NULL,
    "requester_id" UUID NOT NULL,
    "courier_id" UUID,
    "amount" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'RESERVED',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "settled_at" TIMESTAMPTZ(3),
    "released_at" TIMESTAMPTZ(3),
    CONSTRAINT "credit_reservations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "credit_reservations_amount_positive" CHECK ("amount" > 0),
    CONSTRAINT "credit_reservations_terminal_state_consistent" CHECK (
      ("status" = 'RESERVED' AND "courier_id" IS NULL AND "settled_at" IS NULL AND "released_at" IS NULL)
      OR ("status" = 'SETTLED' AND "courier_id" IS NOT NULL AND "settled_at" IS NOT NULL AND "released_at" IS NULL)
      OR ("status" = 'RELEASED' AND "courier_id" IS NULL AND "settled_at" IS NULL AND "released_at" IS NOT NULL)
    )
);

CREATE TABLE "credit_ledger_entries" (
    "id" UUID NOT NULL,
    "account_user_id" UUID NOT NULL,
    "reservation_id" UUID,
    "type" "LedgerEntryType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "available_balance_after" INTEGER NOT NULL,
    "reserved_balance_after" INTEGER NOT NULL,
    "reference_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "credit_ledger_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "credit_ledger_amount_positive" CHECK ("amount" > 0),
    CONSTRAINT "credit_ledger_available_nonnegative" CHECK ("available_balance_after" >= 0),
    CONSTRAINT "credit_ledger_reserved_nonnegative" CHECK ("reserved_balance_after" >= 0)
);

CREATE UNIQUE INDEX "credit_reservations_errand_id_key" ON "credit_reservations"("errand_id");
CREATE INDEX "credit_reservations_requester_id_idx" ON "credit_reservations"("requester_id");
CREATE INDEX "credit_reservations_courier_id_idx" ON "credit_reservations"("courier_id");
CREATE INDEX "credit_reservations_status_updated_at_idx" ON "credit_reservations"("status", "updated_at");
CREATE UNIQUE INDEX "credit_ledger_entries_reference_key_key" ON "credit_ledger_entries"("reference_key");
CREATE INDEX "credit_ledger_entries_account_user_id_created_at_idx" ON "credit_ledger_entries"("account_user_id", "created_at");
CREATE INDEX "credit_ledger_entries_reservation_id_idx" ON "credit_ledger_entries"("reservation_id");
CREATE INDEX "credit_ledger_entries_created_at_idx" ON "credit_ledger_entries"("created_at");

ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "credit_accounts"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_courier_id_fkey" FOREIGN KEY ("courier_id") REFERENCES "credit_accounts"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_account_user_id_fkey" FOREIGN KEY ("account_user_id") REFERENCES "credit_accounts"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "credit_reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
