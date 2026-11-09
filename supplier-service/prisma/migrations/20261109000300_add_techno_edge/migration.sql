BEGIN;

UPDATE "suppliers"
SET "categories" = ARRAY['FOOD', 'BEVERAGES']::supplier_tag[],
    "category" = 'FOOD_COFFEE',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "name" = 'he by He Brews'
  AND ("categories" IS DISTINCT FROM ARRAY['FOOD', 'BEVERAGES']::supplier_tag[]
       OR "category" <> 'FOOD_COFFEE');

INSERT INTO "suppliers" ("id", "name", "category", "categories", "updated_at")
VALUES ('10000000-0000-4000-8000-000000000075', 'Techno Edge', 'FOOD_COFFEE',
        ARRAY['FOOD', 'BEVERAGES']::supplier_tag[], CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO UPDATE SET
  "category" = EXCLUDED."category",
  "categories" = EXCLUDED."categories",
  "updated_at" = CURRENT_TIMESTAMP;

-- Source: https://uci.nus.edu.sg/campus-life/campus-services/retail-dining/kent-ridge/
-- Weekday hours are stored in the daily-hours fields; exceptions remain in the description.
-- Unverified floor and coordinates are deliberately null.
INSERT INTO "supplier_locations" (
  "id", "supplier_id", "supplier_at_location", "building", "floor",
  "location_description", "latitude", "longitude", "opens_at", "closes_at",
  "is_open_overnight", "image_url", "updated_at"
)
SELECT '20000000-0000-4000-8000-000000000075', supplier."id",
       'Techno Edge@College of Design and Engineering', 'College of Design and Engineering', NULL,
       'Techno Edge canteen. Mon-Fri 0700-2000; Sat 0730-1400; Sun and PH closed. Individual stall hours vary.',
       NULL, NULL, '07:00'::time, '20:00'::time, false, NULL, CURRENT_TIMESTAMP
FROM "suppliers" AS supplier
WHERE supplier."name" = 'Techno Edge'
  AND NOT EXISTS (SELECT 1 FROM "supplier_locations" WHERE "supplier_id" = supplier."id");

COMMIT;
