-- Sweeper scan for the 4-hour auto-complete (D-008): only DELIVERED rows, by deadline.
CREATE INDEX "errands_delivered_deadline_idx" ON "errands"("delivered_at") WHERE "status" = 'DELIVERED' AND "deleted_at" IS NULL;
