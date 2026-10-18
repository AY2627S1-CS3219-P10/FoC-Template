-- Lifecycle timestamps, completion method (D-008) and per-transition history for the
-- decided rows of docs/requirements.md §3. Cancel/expiry states get no constraints
-- yet (Q-006, Q-007). No route sets a non-OPEN status before this migration, so
-- existing rows satisfy every new CHECK.
CREATE TYPE "CompletionMethod" AS ENUM ('REQUESTER_CONFIRMED', 'AUTO_TIMEOUT');
CREATE TYPE "ActorRole" AS ENUM ('REQUESTER', 'COURIER', 'ADMIN', 'SYSTEM');

ALTER TABLE "errands"
    ADD COLUMN "accepted_at" TIMESTAMPTZ(3),
    ADD COLUMN "picked_up_at" TIMESTAMPTZ(3),
    ADD COLUMN "delivered_at" TIMESTAMPTZ(3),
    ADD COLUMN "disputed_at" TIMESTAMPTZ(3),
    ADD COLUMN "completed_at" TIMESTAMPTZ(3),
    ADD COLUMN "cancelled_at" TIMESTAMPTZ(3),
    ADD COLUMN "completion_method" "CompletionMethod";

-- Each state carries the facts of every transition that led to it.
ALTER TABLE "errands" ADD CONSTRAINT "errands_assigned_states" CHECK ("status" NOT IN ('ACCEPTED', 'PICKED_UP', 'DELIVERED', 'DISPUTED', 'COMPLETED') OR ("courier_id" IS NOT NULL AND "accepted_at" IS NOT NULL));
ALTER TABLE "errands" ADD CONSTRAINT "errands_picked_up_states" CHECK ("status" NOT IN ('PICKED_UP', 'DELIVERED', 'DISPUTED', 'COMPLETED') OR "picked_up_at" IS NOT NULL);
ALTER TABLE "errands" ADD CONSTRAINT "errands_delivered_states" CHECK ("status" NOT IN ('DELIVERED', 'DISPUTED') OR "delivered_at" IS NOT NULL);
ALTER TABLE "errands" ADD CONSTRAINT "errands_disputed_state" CHECK ("status" <> 'DISPUTED' OR "disputed_at" IS NOT NULL);
ALTER TABLE "errands" ADD CONSTRAINT "errands_completion" CHECK (("status" = 'COMPLETED') = ("completed_at" IS NOT NULL AND "completion_method" IS NOT NULL) AND ("completion_method" IS DISTINCT FROM 'AUTO_TIMEOUT' OR "delivered_at" IS NOT NULL));
ALTER TABLE "errands" ADD CONSTRAINT "errands_lifecycle_order" CHECK ("picked_up_at" >= "accepted_at" AND "delivered_at" >= "picked_up_at" AND "disputed_at" >= "delivered_at" AND "completed_at" >= "picked_up_at");

-- Append-only audit of status changes; actor_id is NULL only for SYSTEM.
CREATE TABLE "errand_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "errand_id" UUID NOT NULL,
    "from_status" "ErrandStatus",
    "to_status" "ErrandStatus" NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "actor_role" "ActorRole" NOT NULL,
    "actor_id" UUID,
    "correlation_id" VARCHAR(128),
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "errand_history_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "errand_history_actor" CHECK (("actor_role" = 'SYSTEM') = ("actor_id" IS NULL))
);
CREATE INDEX "errand_history_errand_id_occurred_at_idx" ON "errand_history"("errand_id", "occurred_at");
ALTER TABLE "errand_history" ADD CONSTRAINT "errand_history_errand_id_fkey" FOREIGN KEY ("errand_id") REFERENCES "errands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
