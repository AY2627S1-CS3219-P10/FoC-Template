-- AI Assistance Disclosure:
-- Tool: GPT-6.1 Sol.
-- Scope: AI-assisted implementation of SQL statements in migration 20261108000100_supplier_category_tags.
-- Author review: Checked 20261108000100_supplier_category_tags statements and affected record values for consistency; edited SQL formatting and comments.

CREATE TYPE "supplier_tag" AS ENUM ('FOOD', 'BEVERAGES', 'PRINTING', 'SHOPPING');

ALTER TABLE "suppliers" ADD COLUMN "categories" "supplier_tag"[];

-- Preserve every supplier/outlet ID. Only the existing combined category implies both tags.
UPDATE "suppliers" SET "categories" = CASE "category"
  WHEN 'FOOD_COFFEE' THEN ARRAY['FOOD', 'BEVERAGES']::supplier_tag[]
  ELSE ARRAY["category"::text::supplier_tag]
END;

ALTER TABLE "suppliers" ALTER COLUMN "categories" SET NOT NULL;
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_categories_valid" CHECK (
  array_ndims("categories") = 1
  AND cardinality("categories") BETWEEN 1 AND 4
  AND array_position("categories", NULL) IS NULL
  AND cardinality("categories") =
    ('FOOD'::supplier_tag = ANY("categories"))::int +
    ('BEVERAGES'::supplier_tag = ANY("categories"))::int +
    ('PRINTING'::supplier_tag = ANY("categories"))::int +
    ('SHOPPING'::supplier_tag = ANY("categories"))::int
);
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_category_compatibility" CHECK (
  "category"::text = CASE
    WHEN 'BEVERAGES'::supplier_tag = ANY("categories") THEN 'FOOD_COFFEE'
    WHEN 'FOOD'::supplier_tag = ANY("categories") THEN 'FOOD'
    WHEN 'PRINTING'::supplier_tag = ANY("categories") THEN 'PRINTING'
    ELSE 'SHOPPING'
  END
);
CREATE INDEX "suppliers_categories_idx" ON "suppliers" USING GIN ("categories");
