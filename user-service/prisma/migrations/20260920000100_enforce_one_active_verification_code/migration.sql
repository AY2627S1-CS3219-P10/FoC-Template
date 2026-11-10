-- AI Assistance Disclosure:
-- Tool: GPT-6.1 Sol.
-- Scope: AI-assisted implementation of SQL migration 20260920000100_enforce_one_active_verification_code (create unique index).
-- Author review: Validated the SQL statements for migration in migration 20260920000100_enforce_one_active_verification_code; edited SQL layout and comments for readability.

-- Prevent concurrent issuance from leaving multiple unused verification codes.
CREATE UNIQUE INDEX "email_verification_codes_one_unused_per_user_key"
    ON "email_verification_codes"("user_id")
    WHERE "used_at" IS NULL;
