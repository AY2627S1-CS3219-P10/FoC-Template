-- AI Assistance Disclosure:
-- Tool: GPT-6.1 Sol.
-- Scope: AI-assisted implementation of SQL migration 20261015000100_identify_outlets_by_building_and_floor (drop index, alter table, create unique index).
-- Author review: Validated the SQL statements for supplier_locations in migration 20261015000100_identify_outlets_by_building_and_floor; edited SQL layout and comments for readability.

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
