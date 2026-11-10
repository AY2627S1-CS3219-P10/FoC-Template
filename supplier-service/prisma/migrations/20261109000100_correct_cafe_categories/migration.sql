BEGIN;

-- These cafes sell food as well as drinks. Match the brand and its named outlets.
UPDATE "suppliers"
SET "categories" = ARRAY['FOOD', 'BEVERAGES']::supplier_tag[],
    "category" = 'FOOD_COFFEE',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "name"::text ~* '^(Starbucks|Poonsti Cafe|The Coffee Bean (and|&) Tea Leaf|TOMORO COFFEE)([[:space:]]*@.*)?$'
  AND ("categories" IS DISTINCT FROM ARRAY['FOOD', 'BEVERAGES']::supplier_tag[]
       OR "category" <> 'FOOD_COFFEE');

-- Wonderful Cafe is classified as food only, including its CDE and S16 outlets.
UPDATE "suppliers"
SET "categories" = ARRAY['FOOD']::supplier_tag[],
    "category" = 'FOOD',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "name"::text ~* '^Wonderful Cafe([[:space:]]*@.*)?$'
  AND ("categories" IS DISTINCT FROM ARRAY['FOOD']::supplier_tag[]
       OR "category" <> 'FOOD');

COMMIT;
