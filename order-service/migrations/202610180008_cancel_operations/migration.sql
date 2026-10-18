-- D-014/D-015: requester cancel runs through the journal because it releases credits
-- over HTTP. History rows keep the courier an errand had, so a cancel or reopen that
-- releases them still says who they were.
ALTER TYPE "OperationKind" ADD VALUE 'CANCEL';
ALTER TABLE "errand_history" ADD COLUMN "courier_id" UUID;
