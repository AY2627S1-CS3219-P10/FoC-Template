-- AI Assistance Disclosure:
-- Tool: GPT-6.1 Sol.
-- Scope: AI-assisted implementation of SQL migration 20261016000100_allow_confirmed_pickup_points (drop index, alter table, create unique index).
-- Author review: Validated the SQL statements for supplier_locations in migration 20261016000100_allow_confirmed_pickup_points; edited SQL layout and comments for readability.

BEGIN;
DROP INDEX "supplier_locations_supplier_id_building_floor_key";
ALTER TABLE "supplier_locations" ALTER COLUMN "location_description" TYPE CITEXT;
CREATE UNIQUE INDEX "supplier_locations_pickup_point_key"
    ON "supplier_locations" ("supplier_id", "building", "floor", "location_description") NULLS NOT DISTINCT;
COMMIT;
