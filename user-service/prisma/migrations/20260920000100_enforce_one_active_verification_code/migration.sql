-- Prevent concurrent issuance from leaving multiple unused verification codes.
CREATE UNIQUE INDEX "email_verification_codes_one_unused_per_user_key"
    ON "email_verification_codes"("user_id")
    WHERE "used_at" IS NULL;
