-- Correct the catalog without replacing supplier or pickup-location identities.
UPDATE "suppliers" AS supplier
SET "categories" = requested.tags,
    "category" = 'FOOD_COFFEE',
    "updated_at" = CURRENT_TIMESTAMP
FROM (VALUES
  ('Cool Spot', ARRAY['FOOD', 'BEVERAGES']::supplier_tag[]),
  ('Mr Bean / Do Qoo', ARRAY['FOOD', 'BEVERAGES']::supplier_tag[]),
  ('Nine Fresh', ARRAY['FOOD', 'BEVERAGES']::supplier_tag[]),
  ('Fine Food', ARRAY['FOOD', 'BEVERAGES']::supplier_tag[]),
  ('Flavours @ UTown', ARRAY['FOOD', 'BEVERAGES']::supplier_tag[]),
  ('Central Square @ YIH', ARRAY['FOOD', 'BEVERAGES']::supplier_tag[]),
  ('Mixue', ARRAY['BEVERAGES']::supplier_tag[]),
  ('CHAGEE', ARRAY['BEVERAGES']::supplier_tag[]),
  ('Cafe+ Robot Cafe', ARRAY['BEVERAGES']::supplier_tag[])
) AS requested(name, tags)
WHERE supplier."name" = requested.name::citext
  AND (supplier."categories" IS DISTINCT FROM requested.tags
       OR supplier."category" <> 'FOOD_COFFEE');
