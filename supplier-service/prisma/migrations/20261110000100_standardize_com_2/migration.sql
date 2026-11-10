-- AI-assisted data correction; review required. Preserve supplier and outlet IDs.
UPDATE "supplier_locations" AS location
SET "building" = 'Com 2',
    "supplier_at_location" = supplier."name" || '@Com 2',
    "updated_at" = CURRENT_TIMESTAMP
FROM "suppliers" AS supplier
WHERE location."supplier_id" = supplier."id"
  AND location."building"::text ~* '^[[:space:]]*com[[:space:]]*2[[:space:]]*$'
  AND location."building"::text IS DISTINCT FROM 'Com 2';
