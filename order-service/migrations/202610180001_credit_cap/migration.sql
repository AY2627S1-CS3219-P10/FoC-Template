-- AI Assistance Disclosure:
-- Tool: GPT-6.1 Sol.
-- Scope: AI-assisted implementation of SQL migration 202610180001_credit_cap (alter table).
-- Author review: Validated the SQL statements for errands in migration 202610180001_credit_cap; edited SQL layout and comments for readability.

-- Credit Service caps every amount at MAX_CREDIT_BALANCE (10,000,000); a larger bounty
-- could never be reserved, so reject it in Order's database too (defect K1).
ALTER TABLE "errands" DROP CONSTRAINT "errands_positive_bounty";
ALTER TABLE "errands" ADD CONSTRAINT "errands_positive_bounty" CHECK ("offered_credits" BETWEEN 1 AND 10000000);
