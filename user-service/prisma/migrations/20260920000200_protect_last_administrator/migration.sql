-- Serialize administrator removals and reject any demotion or deletion that
-- would leave the service without an administrator.
CREATE FUNCTION "protect_last_administrator"()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD."is_admin" THEN
        IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NOT NEW."is_admin") THEN
            PERFORM pg_advisory_xact_lock(3219, 1);

            IF NOT EXISTS (
                SELECT 1
                FROM "users"
                WHERE "is_admin" = true
                  AND "id" <> OLD."id"
            ) THEN
                RAISE EXCEPTION 'The system must retain at least one administrator.'
                    USING ERRCODE = '23514',
                          CONSTRAINT = 'users_require_at_least_one_administrator';
            END IF;
        END IF;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "users_protect_last_administrator"
AFTER UPDATE OF "is_admin" OR DELETE ON "users"
FOR EACH ROW
EXECUTE FUNCTION "protect_last_administrator"();
