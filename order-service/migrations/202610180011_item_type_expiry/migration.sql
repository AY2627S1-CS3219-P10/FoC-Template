-- D-018: the requester picks the item type at creation, which fixes the expiry deadline
-- once: FOOD 2 h, NON_PERISHABLE 24 h after created_at. Existing rows were created
-- without a choice, so they get the default. EXPIRE journals the credit release (D-019).
CREATE TYPE "ErrandItemType" AS ENUM ('FOOD', 'NON_PERISHABLE');
ALTER TYPE "OperationKind" ADD VALUE 'EXPIRE';
ALTER TABLE "errands"
    ADD COLUMN "item_type" "ErrandItemType" NOT NULL DEFAULT 'NON_PERISHABLE',
    ADD COLUMN "expires_at" TIMESTAMPTZ(3);
UPDATE "errands" SET "expires_at" = "created_at" + interval '24 hours';
ALTER TABLE "errands" ALTER COLUMN "expires_at" SET NOT NULL;
-- The deadline never moves, not even when an errand reopens (D-017).
ALTER TABLE "errands" ADD CONSTRAINT "errands_expiry_deadline" CHECK ("expires_at" = "created_at" + CASE "item_type" WHEN 'FOOD' THEN interval '2 hours' ELSE interval '24 hours' END);
-- Sweeper scan for expiry: only OPEN rows, by deadline.
CREATE INDEX "errands_open_expiry_idx" ON "errands"("expires_at") WHERE "status" = 'OPEN' AND "deleted_at" IS NULL;
