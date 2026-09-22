CREATE EXTENSION IF NOT EXISTS "citext";

CREATE TYPE "supplier_category" AS ENUM (
    'FOOD',
    'FOOD_COFFEE',
    'PRINTING',
    'SHOPPING'
);

CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "name" CITEXT NOT NULL,
    "category" "supplier_category" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplier_locations" (
    "id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "supplier_at_location" CITEXT NOT NULL,
    "building" VARCHAR(160) NOT NULL,
    "floor" INTEGER NOT NULL,
    "location_description" VARCHAR(500) NOT NULL,
    "latitude" DECIMAL(11,8) NOT NULL,
    "longitude" DECIMAL(11,8) NOT NULL,
    "opens_at" TIME(0) NOT NULL,
    "closes_at" TIME(0) NOT NULL,
    "is_open_overnight" BOOLEAN NOT NULL DEFAULT false,
    "image_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "supplier_locations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "supplier_locations_floor_check" CHECK ("floor" >= 0),
    CONSTRAINT "supplier_locations_latitude_check" CHECK ("latitude" BETWEEN -90 AND 90),
    CONSTRAINT "supplier_locations_longitude_check" CHECK ("longitude" BETWEEN -180 AND 180)
);

CREATE UNIQUE INDEX "suppliers_name_key" ON "suppliers"("name");
CREATE UNIQUE INDEX "supplier_locations_supplier_at_location_key"
    ON "supplier_locations"("supplier_at_location");
CREATE UNIQUE INDEX "supplier_locations_supplier_id_building_floor_location_description_key"
    ON "supplier_locations"("supplier_id", "building", "floor", "location_description");
CREATE INDEX "supplier_locations_building_is_active_idx"
    ON "supplier_locations"("building", "is_active");
CREATE INDEX "supplier_locations_supplier_id_is_active_idx"
    ON "supplier_locations"("supplier_id", "is_active");

ALTER TABLE "supplier_locations"
    ADD CONSTRAINT "supplier_locations_supplier_id_fkey"
    FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "suppliers" ("id", "name", "category", "updated_at") VALUES
    ('10000000-0000-4000-8000-000000000001', 'Anna''s x Soup Union', 'FOOD', CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000002', 'NUS Co-op', 'SHOPPING', CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000003', 'Printer @ Com 2', 'PRINTING', CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000004', 'Cool Spot', 'FOOD', CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000005', 'InstaChef', 'FOOD', CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000006', 'Cafe+ Robot Cafe', 'FOOD_COFFEE', CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000007', 'A Hot Hideout', 'FOOD', CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000008', 'Arise and Shine', 'FOOD', CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000009', 'Bakehaus / Aurea', 'FOOD', CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000010', 'Central Square @ YIH', 'FOOD', CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000011', 'Pasta Express', 'FOOD', CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000012', 'TOMORO COFFEE', 'FOOD_COFFEE', CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000013', 'Octobox', 'SHOPPING', CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000014', 'Smooy', 'FOOD', CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000015', 'Goh Bros E-Print Pte Ltd', 'PRINTING', CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000016', 'Cheers Unmanned Convenience Store', 'SHOPPING', CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000017', 'Nami', 'FOOD', CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000018', 'Supersnacks', 'FOOD', CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000019', 'Good Day Cafe', 'FOOD_COFFEE', CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000020', 'The Coffee Roaster', 'FOOD_COFFEE', CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000021', 'he by He Brews', 'FOOD_COFFEE', CURRENT_TIMESTAMP);

INSERT INTO "supplier_locations" (
    "id", "supplier_id", "supplier_at_location", "building", "floor",
    "location_description", "latitude", "longitude", "opens_at", "closes_at",
    "is_open_overnight", "image_url", "updated_at"
) VALUES
    ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Anna''s x Soup Union@Central Library', 'Central Library', 1, 'Next to NUS Co-op', 1.29644400, 103.77303200, '09:00', '18:00', false, 'https://github.com/CS3219-AY2627S1/FoC-Template/blob/main/data/images/ANNA.jpeg', CURRENT_TIMESTAMP),
    ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'NUS Co-op@Central Library', 'Central Library', 1, 'Inside the library on the right side', 1.29678660, 103.77326770, '09:00', '16:00', false, 'https://github.com/CS3219-AY2627S1/FoC-Template/blob/main/data/images/NUS_COOP.jpeg', CURRENT_TIMESTAMP),
    ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'Printer @ Com 2@Com 2', 'Com 2', 1, 'Next to LT19', 1.29383470, 103.77445720, '00:00', '23:59', false, 'https://github.com/CS3219-AY2627S1/FoC-Template/blob/main/data/images/PRINTER_COM2.jpeg', CURRENT_TIMESTAMP),
    ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', 'Cool Spot@Com2', 'Com2', 1, 'Opp LT16', 1.29401560, 103.77384780, '09:00', '21:30', false, 'https://github.com/CS3219-AY2627S1/FoC-Template/blob/main/data/images/COOL_SPOT.jpeg', CURRENT_TIMESTAMP),
    ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000005', 'InstaChef@Terrace', 'Terrace', 1, 'Next to foyer', 1.29388980, 103.77363050, '00:00', '23:59', false, 'https://github.com/CS3219-AY2627S1/FoC-Template/blob/main/data/images/INSTACHEF.jpeg', CURRENT_TIMESTAMP),
    ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000006', 'Cafe+ Robot Cafe@Central Library', 'Central Library', 1, 'Opp to central library entrance', 1.29644400, 103.77303200, '00:00', '23:59', false, 'https://github.com/CS3219-AY2627S1/FoC-Template/blob/main/data/images/ROBOT_CAFE.jpeg', CURRENT_TIMESTAMP),
    ('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000007', 'A Hot Hideout@Prince George''s Park', 'Prince George''s Park', 2, 'Near PGP entrance', 1.29084450, 103.77708910, '11:00', '21:30', false, NULL, CURRENT_TIMESTAMP),
    ('20000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000008', 'Arise and Shine@Engineering Block E4', 'Engineering Block E4', 4, 'Near LT6', 1.29915170, 103.76906400, '08:00', '18:00', false, NULL, CURRENT_TIMESTAMP),
    ('20000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000009', 'Bakehaus / Aurea@The Ridge', 'The Ridge', 1, 'Near COM2', 1.29467780, 103.77078720, '08:00', '21:00', false, NULL, CURRENT_TIMESTAMP),
    ('20000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000010', 'Central Square @ YIH@Yusof Ishak House', 'Yusof Ishak House', 1, 'Closest to Opp UHC bus stop', 1.29844010, 103.77262560, '08:00', '20:00', false, NULL, CURRENT_TIMESTAMP),
    ('20000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000011', 'Pasta Express@Frontier', 'Frontier', 1, 'Aircon section', 1.29478190, 103.77044350, '09:30', '19:30', false, NULL, CURRENT_TIMESTAMP),
    ('20000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000012', 'TOMORO COFFEE@Hon Sui Sen Memorial Library', 'Hon Sui Sen Memorial Library', 2, 'Inside HSSML', 1.29312590, 103.77199430, '08:15', '18:00', false, NULL, CURRENT_TIMESTAMP),
    ('20000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000013', 'Octobox@Prince George''s Park', 'Prince George''s Park', 2, 'Near PGP entrance', 1.29043470, 103.77875880, '00:00', '23:59', false, NULL, CURRENT_TIMESTAMP),
    ('20000000-0000-4000-8000-000000000014', '10000000-0000-4000-8000-000000000014', 'Smooy@COM3', 'COM3', 1, 'The Terrace @ COM3', 1.29483080, 103.77163050, '11:00', '21:00', false, NULL, CURRENT_TIMESTAMP),
    ('20000000-0000-4000-8000-000000000015', '10000000-0000-4000-8000-000000000015', 'Goh Bros E-Print Pte Ltd@Yusof Ishak House', 'Yusof Ishak House', 5, 'Take the long staircase up YIH', 1.29849050, 103.77205440, '09:00', '18:00', false, NULL, CURRENT_TIMESTAMP),
    ('20000000-0000-4000-8000-000000000016', '10000000-0000-4000-8000-000000000016', 'Cheers Unmanned Convenience Store@Engineering Block E3', 'Engineering Block E3', 4, 'Take right from Arise n Shine', 1.29943410, 103.75262980, '00:00', '23:59', false, NULL, CURRENT_TIMESTAMP),
    ('20000000-0000-4000-8000-000000000017', '10000000-0000-4000-8000-000000000017', 'Nami@innovation4.0', 'innovation4.0', 1, 'Opp TCOMS', 1.29429820, 103.77088130, '08:00', '17:30', false, NULL, CURRENT_TIMESTAMP),
    ('20000000-0000-4000-8000-000000000018', '10000000-0000-4000-8000-000000000018', 'Supersnacks@Prince George''s Park', 'Prince George''s Park', 1, 'At level 1 in Prince George''s Park Residences, Block 10', 1.29138470, 103.77763670, '11:00', '02:00', true, NULL, CURRENT_TIMESTAMP),
    ('20000000-0000-4000-8000-000000000019', '10000000-0000-4000-8000-000000000019', 'Good Day Cafe@Medicine+Science Library', 'Medicine+Science Library', 1, 'Inside MedScience library', 1.29679890, 103.77943360, '07:30', '18:30', false, NULL, CURRENT_TIMESTAMP),
    ('20000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000020', 'The Coffee Roaster@Blk AS8', 'Blk AS8', 1, 'Behind central library bus stop', 1.29625223, 103.77209260, '08:00', '17:30', false, NULL, CURRENT_TIMESTAMP),
    ('20000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000021', 'he by He Brews@Engineering Block EA', 'Engineering Block EA', 1, 'Near LT7 & Engineering Auditorium', 1.30056680, 103.77075770, '08:00', '17:00', false, NULL, CURRENT_TIMESTAMP);
