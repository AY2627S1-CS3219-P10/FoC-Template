BEGIN;
DROP INDEX "supplier_locations_supplier_id_building_floor_key";
ALTER TABLE "supplier_locations" ALTER COLUMN "location_description" TYPE CITEXT;
CREATE UNIQUE INDEX "supplier_locations_pickup_point_key"
    ON "supplier_locations" ("supplier_id", "building", "floor", "location_description") NULLS NOT DISTINCT;
COMMIT;
