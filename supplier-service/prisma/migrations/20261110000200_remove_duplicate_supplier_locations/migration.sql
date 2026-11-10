-- Remove three duplicate pickup locations that were inserted with text differing
-- only by trailing whitespace or straight versus curly apostrophes. Preserve the
-- deterministic seeded location IDs used by the current supplier catalog.
DELETE FROM "supplier_locations"
WHERE "id" IN (
  '053f8c16-5c74-4fbe-b8c8-96d668457840',
  '02829a53-b4fe-479d-96e9-468413d416fb',
  '16f46d4b-5cd3-4781-a7c4-cd7c7f38b6d1'
);
