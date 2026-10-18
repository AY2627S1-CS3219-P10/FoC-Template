-- D-013: IN_PROGRESS is not a state. PICKED_UP already exists, so RENAME VALUE cannot be
-- used: rows move to PICKED_UP and the enum is rebuilt without IN_PROGRESS. No route has
-- ever set IN_PROGRESS; a row without a courier would fail errands_assigned_states here,
-- which is the right outcome for data no lifecycle could have produced.
UPDATE "errands"
SET "status" = 'PICKED_UP',
    "accepted_at" = COALESCE("accepted_at", "updated_at"),
    "picked_up_at" = COALESCE("picked_up_at", "accepted_at", "updated_at")
WHERE "status" = 'IN_PROGRESS';
UPDATE "errand_history" SET "from_status" = 'PICKED_UP' WHERE "from_status" = 'IN_PROGRESS';
UPDATE "errand_history" SET "to_status" = 'PICKED_UP' WHERE "to_status" = 'IN_PROGRESS';

-- Constraints and partial indexes compare "status" with literals of the old type, so they
-- are dropped and recreated around the type change.
ALTER TABLE "errands" DROP CONSTRAINT "errands_open_unassigned";
ALTER TABLE "errands" DROP CONSTRAINT "errands_assigned_states";
ALTER TABLE "errands" DROP CONSTRAINT "errands_picked_up_states";
ALTER TABLE "errands" DROP CONSTRAINT "errands_delivered_states";
ALTER TABLE "errands" DROP CONSTRAINT "errands_disputed_state";
ALTER TABLE "errands" DROP CONSTRAINT "errands_completion";
DROP INDEX "errands_visible_open_idx";
DROP INDEX "errands_delivered_deadline_idx";
ALTER TABLE "errands" ALTER COLUMN "status" DROP DEFAULT;

ALTER TYPE "ErrandStatus" RENAME TO "ErrandStatus_old";
CREATE TYPE "ErrandStatus" AS ENUM ('OPEN', 'ACCEPTED', 'PICKED_UP', 'DELIVERED', 'DISPUTED', 'COMPLETED', 'CANCELLED', 'EXPIRED');
ALTER TABLE "errands" ALTER COLUMN "status" TYPE "ErrandStatus" USING "status"::text::"ErrandStatus";
ALTER TABLE "errand_history"
    ALTER COLUMN "from_status" TYPE "ErrandStatus" USING "from_status"::text::"ErrandStatus",
    ALTER COLUMN "to_status" TYPE "ErrandStatus" USING "to_status"::text::"ErrandStatus";
DROP TYPE "ErrandStatus_old";
ALTER TABLE "errands" ALTER COLUMN "status" SET DEFAULT 'OPEN';

ALTER TABLE "errands" ADD CONSTRAINT "errands_open_unassigned" CHECK ("status" <> 'OPEN' OR "courier_id" IS NULL);
ALTER TABLE "errands" ADD CONSTRAINT "errands_assigned_states" CHECK ("status" NOT IN ('ACCEPTED', 'PICKED_UP', 'DELIVERED', 'DISPUTED', 'COMPLETED') OR ("courier_id" IS NOT NULL AND "accepted_at" IS NOT NULL));
ALTER TABLE "errands" ADD CONSTRAINT "errands_picked_up_states" CHECK ("status" NOT IN ('PICKED_UP', 'DELIVERED', 'DISPUTED', 'COMPLETED') OR "picked_up_at" IS NOT NULL);
ALTER TABLE "errands" ADD CONSTRAINT "errands_delivered_states" CHECK ("status" NOT IN ('DELIVERED', 'DISPUTED') OR "delivered_at" IS NOT NULL);
ALTER TABLE "errands" ADD CONSTRAINT "errands_disputed_state" CHECK ("status" <> 'DISPUTED' OR "disputed_at" IS NOT NULL);
ALTER TABLE "errands" ADD CONSTRAINT "errands_completion" CHECK (("status" = 'COMPLETED') = ("completed_at" IS NOT NULL AND "completion_method" IS NOT NULL) AND ("completion_method" IS DISTINCT FROM 'AUTO_TIMEOUT' OR "delivered_at" IS NOT NULL));
CREATE INDEX "errands_visible_open_idx" ON "errands" ("created_at" DESC, "id" DESC) WHERE "deleted_at" IS NULL AND "status" = 'OPEN';
CREATE INDEX "errands_delivered_deadline_idx" ON "errands"("delivered_at") WHERE "status" = 'DELIVERED' AND "deleted_at" IS NULL;

-- CANCELLED (D-015) and EXPIRED (D-013) are terminal, reachable only before pickup, and
-- release the courier: each carries its own timestamp and no assignment.
ALTER TABLE "errands" ADD COLUMN "expired_at" TIMESTAMPTZ(3);
ALTER TABLE "errands" ADD CONSTRAINT "errands_cancelled_state" CHECK (("status" = 'CANCELLED') = ("cancelled_at" IS NOT NULL));
ALTER TABLE "errands" ADD CONSTRAINT "errands_expired_state" CHECK (("status" = 'EXPIRED') = ("expired_at" IS NOT NULL));
ALTER TABLE "errands" ADD CONSTRAINT "errands_closed_unassigned" CHECK ("status" NOT IN ('CANCELLED', 'EXPIRED') OR ("courier_id" IS NULL AND "accepted_at" IS NULL AND "picked_up_at" IS NULL));
