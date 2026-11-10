-- AI Assistance Disclosure:
-- Tool: GPT-6.1 Sol.
-- Scope: AI-assisted implementation of SQL migration 202610180006_auto_complete_index (create index).
-- Author review: Validated the SQL statements for migration in migration 202610180006_auto_complete_index; edited SQL layout and comments for readability.

-- Sweeper scan for the 4-hour auto-complete (D-008): only DELIVERED rows, by deadline.
CREATE INDEX "errands_delivered_deadline_idx" ON "errands"("delivered_at") WHERE "status" = 'DELIVERED' AND "deleted_at" IS NULL;
