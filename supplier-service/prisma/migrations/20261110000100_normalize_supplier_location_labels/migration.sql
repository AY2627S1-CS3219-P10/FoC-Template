-- Keep the supplier name, building and floor as separate display fields.
-- This avoids labels such as "A Hot Hideout@Prince George's Park" being
-- followed by the same building again in clients.
UPDATE "supplier_locations" AS location
SET
  "supplier_at_location" = supplier."name",
  "updated_at" = CURRENT_TIMESTAMP
FROM "suppliers" AS supplier
WHERE
  location."supplier_id" = supplier."id"
  AND location."supplier_at_location" IS DISTINCT FROM supplier."name";
