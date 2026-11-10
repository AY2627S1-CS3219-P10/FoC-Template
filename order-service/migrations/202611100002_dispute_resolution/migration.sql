ALTER TABLE "errands" DROP CONSTRAINT "errands_assigned_states";
ALTER TABLE "errands" DROP CONSTRAINT "errands_picked_up_states";
ALTER TABLE "errands" DROP CONSTRAINT "errands_delivered_states";
ALTER TABLE "errands" DROP CONSTRAINT "errands_disputed_state";
ALTER TABLE "errands" ADD CONSTRAINT "errands_assigned_states" CHECK (
  "status" NOT IN ('ACCEPTED', 'PICKED_UP', 'DELIVERED', 'DISPUTED', 'RESOLVED', 'COMPLETED') OR
  ("courier_id" IS NOT NULL AND "accepted_at" IS NOT NULL)
);
ALTER TABLE "errands" ADD CONSTRAINT "errands_picked_up_states" CHECK (
  "status" NOT IN ('PICKED_UP', 'DELIVERED', 'DISPUTED', 'RESOLVED', 'COMPLETED') OR
  "picked_up_at" IS NOT NULL
);
ALTER TABLE "errands" ADD CONSTRAINT "errands_delivered_states" CHECK (
  "status" NOT IN ('DELIVERED', 'DISPUTED', 'RESOLVED') OR "delivered_at" IS NOT NULL
);
ALTER TABLE "errands" ADD CONSTRAINT "errands_disputed_state" CHECK (
  "status" NOT IN ('DISPUTED', 'RESOLVED') OR "disputed_at" IS NOT NULL
);

CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'RESOLVED');
CREATE TYPE "DisputeOutcome" AS ENUM ('REFUND_REQUESTER', 'PAY_COURIER');

CREATE TABLE "errand_disputes" (
  "errand_id" UUID NOT NULL,
  "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
  "requester_statement" VARCHAR(2000) NOT NULL,
  "requester_id" UUID NOT NULL,
  "requester_submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "courier_statement" VARCHAR(2000),
  "courier_id" UUID NOT NULL,
  "courier_submitted_at" TIMESTAMPTZ(3),
  "outcome" "DisputeOutcome",
  "resolved_by" UUID,
  "resolved_at" TIMESTAMPTZ(3),
  CONSTRAINT "errand_disputes_pkey" PRIMARY KEY ("errand_id"),
  CONSTRAINT "errand_disputes_errand_id_fkey" FOREIGN KEY ("errand_id")
    REFERENCES "errands"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "errand_disputes_response_consistency" CHECK (
    ("courier_statement" IS NULL AND "courier_submitted_at" IS NULL) OR
    ("courier_statement" IS NOT NULL AND "courier_submitted_at" IS NOT NULL)
  ),
  CONSTRAINT "errand_disputes_resolution_consistency" CHECK (
    ("status" = 'OPEN' AND "outcome" IS NULL AND "resolved_by" IS NULL AND "resolved_at" IS NULL) OR
    ("status" = 'RESOLVED' AND "outcome" IS NOT NULL AND "resolved_by" IS NOT NULL AND "resolved_at" IS NOT NULL)
  )
);

CREATE INDEX "errand_disputes_status_requester_submitted_at_idx"
  ON "errand_disputes"("status", "requester_submitted_at");
