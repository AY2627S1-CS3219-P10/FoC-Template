ALTER TABLE "credit_reservations"
ADD CONSTRAINT "credit_reservations_distinct_parties"
CHECK ("courier_id" IS NULL OR "courier_id" <> "requester_id");
