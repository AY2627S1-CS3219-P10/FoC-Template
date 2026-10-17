ALTER TABLE "supplier_locations"
    ALTER COLUMN "floor" DROP NOT NULL,
    ALTER COLUMN "latitude" DROP NOT NULL,
    ALTER COLUMN "longitude" DROP NOT NULL;
