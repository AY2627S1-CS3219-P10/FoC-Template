-- AI Assistance Disclosure:
-- Tool: GPT-6.1 Sol.
-- Scope: AI-assisted implementation of SQL migration 202610180010_reopen_index (create index).
-- Author review: Validated the SQL statements for migration in migration 202610180010_reopen_index; edited SQL layout and comments for readability.

-- Sweeper scan for the 30-minute reopen (D-017): only ACCEPTED rows, by deadline.
CREATE INDEX "errands_accepted_deadline_idx" ON "errands"("accepted_at") WHERE "status" = 'ACCEPTED' AND "deleted_at" IS NULL;
