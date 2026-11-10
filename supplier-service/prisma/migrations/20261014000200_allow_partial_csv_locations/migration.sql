-- AI Assistance Disclosure:
-- Tool: GPT-6.1 Sol.
-- Scope: AI-assisted implementation of SQL migration 20261014000200_allow_partial_csv_locations (alter table).
-- Author review: Validated the SQL statements for supplier_locations in migration 20261014000200_allow_partial_csv_locations; edited SQL layout and comments for readability.

ALTER TABLE "supplier_locations"
    ALTER COLUMN "floor" DROP NOT NULL,
    ALTER COLUMN "latitude" DROP NOT NULL,
    ALTER COLUMN "longitude" DROP NOT NULL;
