-- Sweeper scan for the 30-minute reopen (D-017): only ACCEPTED rows, by deadline.
CREATE INDEX "errands_accepted_deadline_idx" ON "errands"("accepted_at") WHERE "status" = 'ACCEPTED' AND "deleted_at" IS NULL;
