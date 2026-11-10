-- AI Assistance Disclosure:
-- Tool: GPT-6.1 Sol.
-- Scope: AI-assisted implementation of SQL migration 202610120004_exact_pickup_labels (update).
-- Author review: Validated the SQL statements for errands, errand_operations in migration 202610120004_exact_pickup_labels; edited SQL layout and comments for readability.

-- Remove only the suffix appended by the original Order Service formatter.
-- The remaining supplier_at_location snapshot retains its original case/spacing.
UPDATE "errands"
SET "pickup_location_label" = regexp_replace("pickup_location_label", ' — [^—]*, level -?[0-9]+$', '')
WHERE "pickup_location_label" ~ ' — [^—]*, level -?[0-9]+$';

-- Pending CREATE/EDIT operations must not restore the old generated suffix.
UPDATE "errand_operations"
SET "payload" = jsonb_set("payload", '{pickupLocationLabel}', to_jsonb(regexp_replace("payload"->>'pickupLocationLabel', ' — [^—]*, level -?[0-9]+$', '')))
WHERE "payload"->>'pickupLocationLabel' ~ ' — [^—]*, level -?[0-9]+$';
