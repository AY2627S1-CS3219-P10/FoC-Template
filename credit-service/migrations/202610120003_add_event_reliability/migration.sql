CREATE TABLE "processed_events" (
    "event_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "processed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("event_id"),
    CONSTRAINT "processed_events_event_type_not_empty"
      CHECK (char_length("event_type") BETWEEN 1 AND 128),
    CONSTRAINT "processed_events_payload_hash_sha256"
      CHECK ("payload_hash" ~ '^[0-9a-f]{64}$')
);

CREATE INDEX "processed_events_event_type_processed_at_idx"
ON "processed_events"("event_type", "processed_at");

CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT FALSE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "outbox_events_names_not_empty" CHECK (
      char_length("aggregate_type") BETWEEN 1 AND 128
      AND char_length("event_type") BETWEEN 1 AND 128
    )
);

CREATE INDEX "outbox_events_published_created_at_idx"
ON "outbox_events"("published", "created_at");
