-- Temporary suspensions are independent of permanent account status and expire
-- automatically when this timestamp is no longer in the future.
ALTER TABLE "users"
ADD COLUMN "suspended_until" TIMESTAMPTZ(6);

CREATE TYPE "user_report_status" AS ENUM ('OPEN', 'RESOLVED');

CREATE TABLE "user_reports" (
    "id" UUID NOT NULL,
    "reporter_user_id" UUID NOT NULL,
    "reported_user_id" UUID NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "status" "user_report_status" NOT NULL DEFAULT 'OPEN',
    "resolved_at" TIMESTAMPTZ(6),
    "resolved_by_admin_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_reports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_reports_not_self" CHECK ("reporter_user_id" <> "reported_user_id"),
    CONSTRAINT "user_reports_resolution_consistent" CHECK (
        ("status" = 'OPEN' AND "resolved_at" IS NULL AND "resolved_by_admin_id" IS NULL)
        OR
        ("status" = 'RESOLVED' AND "resolved_at" IS NOT NULL AND "resolved_by_admin_id" IS NOT NULL)
    )
);

CREATE INDEX "user_reports_reported_user_id_status_created_at_idx"
ON "user_reports"("reported_user_id", "status", "created_at");
CREATE INDEX "user_reports_reporter_user_id_created_at_idx"
ON "user_reports"("reporter_user_id", "created_at");
CREATE INDEX "user_reports_status_created_at_idx"
ON "user_reports"("status", "created_at");

ALTER TABLE "user_reports"
ADD CONSTRAINT "user_reports_reporter_user_id_fkey"
FOREIGN KEY ("reporter_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_reports"
ADD CONSTRAINT "user_reports_reported_user_id_fkey"
FOREIGN KEY ("reported_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_reports"
ADD CONSTRAINT "user_reports_resolved_by_admin_id_fkey"
FOREIGN KEY ("resolved_by_admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Extend the existing database safety net so status changes and temporary
-- suspension cannot leave the service without a usable administrator.
DROP TRIGGER "users_protect_last_administrator" ON "users";

CREATE OR REPLACE FUNCTION "protect_last_administrator"()
RETURNS TRIGGER AS $$
DECLARE
    new_row_is_usable BOOLEAN;
BEGIN
    IF TG_OP = 'DELETE' THEN
        new_row_is_usable := false;
    ELSE
        new_row_is_usable := NEW."is_admin"
            AND NEW."status" = 'ACTIVE'
            AND (NEW."suspended_until" IS NULL OR NEW."suspended_until" <= CURRENT_TIMESTAMP);
    END IF;

    IF OLD."is_admin" AND NOT new_row_is_usable THEN
        PERFORM pg_advisory_xact_lock(3219, 1);

        IF NOT EXISTS (
            SELECT 1
            FROM "users"
            WHERE "is_admin" = true
              AND "status" = 'ACTIVE'
              AND ("suspended_until" IS NULL OR "suspended_until" <= CURRENT_TIMESTAMP)
              AND "id" <> OLD."id"
        ) THEN
            RAISE EXCEPTION 'The system must retain at least one usable administrator.'
                USING ERRCODE = '23514',
                      CONSTRAINT = 'users_require_at_least_one_administrator';
        END IF;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "users_protect_last_administrator"
AFTER UPDATE OF "is_admin", "status", "suspended_until" OR DELETE ON "users"
FOR EACH ROW
EXECUTE FUNCTION "protect_last_administrator"();
