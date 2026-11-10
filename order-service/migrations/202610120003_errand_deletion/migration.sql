-- AI Assistance Disclosure:
-- Tool: GPT-6.1 Sol.
-- Scope: AI-assisted implementation of SQL migration 202610120003_errand_deletion (alter table, create index).
-- Author review: Validated the SQL statements for errands in migration 202610120003_errand_deletion; edited SQL layout and comments for readability.

ALTER TYPE "OperationKind" ADD VALUE 'DELETE';
ALTER TABLE "errands" ADD COLUMN "deleted_at" TIMESTAMPTZ(3);
CREATE INDEX "errands_visible_open_idx" ON "errands" ("created_at" DESC, "id" DESC) WHERE "deleted_at" IS NULL AND "status" = 'OPEN';
