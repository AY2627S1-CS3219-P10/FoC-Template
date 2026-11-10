-- AI Assistance Disclosure:
-- Tool: GPT-6.1 Sol.
-- Scope: AI-assisted implementation of SQL migration 202610180009_excluded_couriers (create table, alter table, update).
-- Author review: Validated the SQL statements for errand_excluded_couriers, errands, CASCADE in migration 202610180009_excluded_couriers; edited SQL layout and comments for readability.

-- D-016/D-017: a courier who gives an errand back, or lets its 30-minute pickup window
-- pass, may never accept that errand again. Other errands are unaffected.
CREATE TABLE "errand_excluded_couriers" (
    "errand_id" UUID NOT NULL,
    "courier_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "errand_excluded_couriers_pkey" PRIMARY KEY ("errand_id", "courier_id")
);
ALTER TABLE "errand_excluded_couriers" ADD CONSTRAINT "errand_excluded_couriers_errand_id_fkey" FOREIGN KEY ("errand_id") REFERENCES "errands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
