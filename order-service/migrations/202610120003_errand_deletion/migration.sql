ALTER TYPE "OperationKind" ADD VALUE 'DELETE';
ALTER TABLE "errands" ADD COLUMN "deleted_at" TIMESTAMPTZ(3);
CREATE INDEX "errands_visible_open_idx" ON "errands" ("created_at" DESC, "id" DESC) WHERE "deleted_at" IS NULL AND "status" = 'OPEN';
