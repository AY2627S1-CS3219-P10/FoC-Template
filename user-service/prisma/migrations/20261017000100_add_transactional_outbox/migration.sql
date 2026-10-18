CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "aggregate_type" VARCHAR(128) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "event_type" VARCHAR(128) NOT NULL,
    "payload" JSONB NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT FALSE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "outbox_events_names_not_empty" CHECK (
        char_length("aggregate_type") > 0
        AND char_length("event_type") > 0
    )
);

CREATE UNIQUE INDEX "outbox_events_aggregate_id_event_type_key"
ON "outbox_events"("aggregate_id", "event_type");

CREATE INDEX "outbox_events_published_created_at_idx"
ON "outbox_events"("published", "created_at");
