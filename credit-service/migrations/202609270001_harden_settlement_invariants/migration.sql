-- AI Assistance Disclosure:
-- Tool: GPT-6.1 Sol.
-- Scope: AI-assisted implementation of SQL migration 202609270001_harden_settlement_invariants (alter table).
-- Author review: Validated the SQL statements for credit_reservations in migration 202609270001_harden_settlement_invariants; edited SQL layout and comments for readability.

ALTER TABLE "credit_reservations"
ADD CONSTRAINT "credit_reservations_distinct_parties"
CHECK ("courier_id" IS NULL OR "courier_id" <> "requester_id");
