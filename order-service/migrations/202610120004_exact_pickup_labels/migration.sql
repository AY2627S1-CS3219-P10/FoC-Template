-- Remove only the suffix appended by the original Order Service formatter.
-- The remaining supplier_at_location snapshot retains its original case/spacing.
UPDATE "errands"
SET "pickup_location_label" = regexp_replace("pickup_location_label", ' — [^—]*, level -?[0-9]+$', '')
WHERE "pickup_location_label" ~ ' — [^—]*, level -?[0-9]+$';

-- Pending CREATE/EDIT operations must not restore the old generated suffix.
UPDATE "errand_operations"
SET "payload" = jsonb_set("payload", '{pickupLocationLabel}', to_jsonb(regexp_replace("payload"->>'pickupLocationLabel', ' — [^—]*, level -?[0-9]+$', '')))
WHERE "payload"->>'pickupLocationLabel' ~ ' — [^—]*, level -?[0-9]+$';
