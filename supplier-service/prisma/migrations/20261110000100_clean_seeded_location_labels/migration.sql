-- Seeded pickup locations already expose their building and floor separately.
-- Remove the generated "supplier@building" suffix so clients can render a
-- concise label such as "A Hot Hideout • Prince George's Park • Floor 2".
-- The predicate only touches labels produced by the CSV seeder and preserves
-- intentional supplier names such as "Starbucks @ UTown".
UPDATE "supplier_locations" AS location
SET
  "supplier_at_location" = supplier."name",
  "updated_at" = CURRENT_TIMESTAMP
FROM "suppliers" AS supplier
WHERE location."supplier_id" = supplier."id"
  AND lower(location."supplier_at_location"::text) =
      lower(supplier."name"::text || '@' || location."building"::text);
