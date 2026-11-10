-- AI Assistance Disclosure:
-- Tool: GPT-6.1 Sol.
-- Scope: AI-assisted implementation of SQL migration 202610180002_operation_correlation (alter table).
-- Author review: Validated the SQL statements for errand_operations in migration 202610180002_operation_correlation; edited SQL layout and comments for readability.

-- Keep the originating request's correlation id on each journal operation so the
-- recovery worker's retries log and call credit-service under the same id (NFR8).
ALTER TABLE "errand_operations" ADD COLUMN "correlation_id" VARCHAR(128);
