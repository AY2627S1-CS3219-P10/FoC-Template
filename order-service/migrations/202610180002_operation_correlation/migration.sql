-- Keep the originating request's correlation id on each journal operation so the
-- recovery worker's retries log and call credit-service under the same id (NFR8).
ALTER TABLE "errand_operations" ADD COLUMN "correlation_id" VARCHAR(128);
