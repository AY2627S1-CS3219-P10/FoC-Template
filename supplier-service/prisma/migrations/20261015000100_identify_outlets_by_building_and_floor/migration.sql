-- Display labels are not identifiers: two floors may share supplier@building.
-- Keep outlet UUIDs and existing labels intact for consumers and historical orders.
BEGIN;

DROP INDEX "supplier_locations_supplier_at_location_key";
DROP INDEX "supplier_locations_supplier_id_building_floor_location_description_key";

ALTER TABLE "supplier_locations" ALTER COLUMN "building" TYPE CITEXT;

-- Unknown floors compare equal so repeated partial entries cannot bypass uniqueness.
CREATE UNIQUE INDEX "supplier_locations_supplier_id_building_floor_key"
    ON "supplier_locations" ("supplier_id", "building", "floor") NULLS NOT DISTINCT;

COMMIT;
