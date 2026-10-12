CREATE TABLE "credit_reservation_adjustments" (
  "operation_id" UUID PRIMARY KEY,
  "reservation_id" UUID NOT NULL REFERENCES "credit_reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "requester_id" UUID NOT NULL,
  "expected_amount" INTEGER NOT NULL CHECK ("expected_amount" > 0),
  "amount" INTEGER NOT NULL CHECK ("amount" > 0),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "credit_reservation_adjustments_reservation_id_created_at_idx" ON "credit_reservation_adjustments"("reservation_id", "created_at");
