-- AI Assistance Disclosure:
-- Tool: GPT-6.1 Sol.
-- Scope: AI-assisted implementation of SQL migration 202610180008_cancel_operations (alter table).
-- Author review: Validated the SQL statements for errand_history in migration 202610180008_cancel_operations; edited SQL layout and comments for readability.

-- D-014/D-015: requester cancel runs through the journal because it releases credits
-- over HTTP. History rows keep the courier an errand had, so a cancel or reopen that
-- releases them still says who they were.
ALTER TYPE "OperationKind" ADD VALUE 'CANCEL';
ALTER TABLE "errand_history" ADD COLUMN "courier_id" UUID;
