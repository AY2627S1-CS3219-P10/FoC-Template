ALTER TABLE "users" ADD COLUMN "suspended_until" TIMESTAMPTZ(6);
CREATE INDEX "users_is_admin_status_suspended_until_idx"
    ON "users"("is_admin", "status", "suspended_until");

CREATE TYPE "report_status" AS ENUM ('OPEN', 'RESOLVED');
CREATE TABLE "user_reports" (
    "id" UUID NOT NULL,
    "reporter_user_id" UUID NOT NULL,
    "reported_user_id" UUID NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "status" "report_status" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "resolved_at" TIMESTAMPTZ(6),
    "resolved_by_id" UUID,
    CONSTRAINT "user_reports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_reports_no_self_report" CHECK ("reporter_user_id" <> "reported_user_id"),
    CONSTRAINT "user_reports_description_length" CHECK (char_length(btrim("description")) BETWEEN 1 AND 500),
    CONSTRAINT "user_reports_resolution_state" CHECK (
        ("status" = 'OPEN' AND "resolved_at" IS NULL AND "resolved_by_id" IS NULL)
        OR ("status" = 'RESOLVED' AND "resolved_at" IS NOT NULL)
    ),
    CONSTRAINT "user_reports_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "user_reports_reported_user_id_fkey" FOREIGN KEY ("reported_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "user_reports_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "user_reports_status_created_at_id_idx" ON "user_reports"("status", "created_at", "id");
CREATE INDEX "user_reports_reporter_user_id_created_at_idx" ON "user_reports"("reporter_user_id", "created_at");
CREATE INDEX "user_reports_reported_user_id_created_at_idx" ON "user_reports"("reported_user_id", "created_at");
CREATE INDEX "user_reports_resolved_by_id_idx" ON "user_reports"("resolved_by_id");

-- Extend the existing lock/constraint to protect usable administrators, including
-- raw SQL status changes. Initial admin seeding remains allowed on an empty DB.
CREATE OR REPLACE FUNCTION "protect_last_administrator"()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD."is_admin" THEN
        IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND (
            NOT NEW."is_admin" OR NEW."status" <> 'ACTIVE'
            OR NEW."suspended_until" > CURRENT_TIMESTAMP
        )) THEN
            PERFORM pg_advisory_xact_lock(3219, 1);
            IF NOT EXISTS (
                SELECT 1 FROM "users"
                WHERE "is_admin" = true AND "id" <> OLD."id" AND "status" = 'ACTIVE'
                AND ("suspended_until" IS NULL OR "suspended_until" <= CURRENT_TIMESTAMP)
            ) THEN
                RAISE EXCEPTION 'The system must retain at least one usable administrator.'
                    USING ERRCODE = '23514', CONSTRAINT = 'users_require_at_least_one_administrator';
            END IF;
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER "users_protect_last_administrator" ON "users";
CREATE TRIGGER "users_protect_last_administrator"
AFTER UPDATE OF "is_admin", "status", "suspended_until" OR DELETE ON "users"
FOR EACH ROW EXECUTE FUNCTION "protect_last_administrator"();
