-- AI Assistance Disclosure:
-- Tool: GPT-6.1 Sol.
-- Scope: AI-assisted implementation of SQL migration 202610300001_courier_reviews (create table, create unique index, create index).
-- Author review: Validated the SQL statements for courier_reviews, errands, CASCADE in migration 202610300001_courier_reviews; edited SQL layout and comments for readability.

-- the sql checks protect the database against invalid stars and self-reviews, 
-- but we also want to make sure that the errand_id is unique so that a courier can only be reviewed once per errand. 
--This is enforced by a unique index on the errand_id column.
CREATE TABLE "courier_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "errand_id" UUID NOT NULL,
    "requester_id" UUID NOT NULL,
    "courier_id" UUID NOT NULL,
    "stars" INTEGER NOT NULL,
    "comment" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "courier_reviews_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "courier_reviews_stars_check"
        CHECK ("stars" BETWEEN 1 AND 5),

    CONSTRAINT "courier_reviews_no_self_review_check"
        CHECK ("requester_id" <> "courier_id")
);

CREATE UNIQUE INDEX "courier_reviews_errand_id_key"
    ON "courier_reviews"("errand_id");

CREATE INDEX "courier_reviews_courier_id_created_at_id_idx"
    ON "courier_reviews"("courier_id", "created_at", "id");

ALTER TABLE "courier_reviews"
    ADD CONSTRAINT "courier_reviews_errand_id_fkey"
    FOREIGN KEY ("errand_id")
    REFERENCES "errands"("id")
    ON DELETE RESTRICT
    ON UPDATE CASCADE;