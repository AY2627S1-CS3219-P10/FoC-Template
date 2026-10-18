-- Transactional outbox (D-001): rows are written in the same statement as the status
-- change and published to RabbitMQ by OutboxRelay. id is the eventId, stable across
-- republishing; headers carry the correlation id, never the payload.
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "aggregate_id" UUID NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "headers" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(3),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "outbox_events_unpublished_idx" ON "outbox_events"("created_at") WHERE "published_at" IS NULL;
-- Credit settles once per errand; a second completion event could only be a bug.
CREATE UNIQUE INDEX "outbox_events_one_completion_per_errand" ON "outbox_events"("aggregate_id") WHERE "event_type" = 'errand.completed.v1';
