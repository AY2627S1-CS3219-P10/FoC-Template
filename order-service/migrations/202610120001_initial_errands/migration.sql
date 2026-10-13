-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ErrandStatus" AS ENUM ('OPEN', 'ACCEPTED', 'IN_PROGRESS', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OperationStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "OperationKind" AS ENUM ('CREATE', 'EDIT');

-- CreateTable
CREATE TABLE "errands" (
    "id" UUID NOT NULL,
    "requester_id" UUID NOT NULL,
    "courier_id" UUID,
    "status" "ErrandStatus" NOT NULL DEFAULT 'OPEN',
    "pickup_location_id" UUID NOT NULL,
    "pickup_supplier_name" VARCHAR(150) NOT NULL,
    "pickup_location_label" VARCHAR(300) NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "delivery_destination" VARCHAR(250) NOT NULL,
    "instructions" VARCHAR(1000) NOT NULL,
    "offered_credits" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "pending_operation_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "errands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "errand_operations" (
    "id" UUID NOT NULL,
    "idempotency_key" UUID NOT NULL,
    "requester_id" UUID NOT NULL,
    "errand_id" UUID NOT NULL,
    "kind" "OperationKind" NOT NULL,
    "status" "OperationStatus" NOT NULL DEFAULT 'PENDING',
    "input_digest" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "expected_version" INTEGER,
    "previous_amount" INTEGER,
    "error_code" VARCHAR(100),
    "error_status" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "errand_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "errands_pending_operation_id_key" ON "errands"("pending_operation_id");

-- CreateIndex
CREATE INDEX "errands_status_courier_id_created_at_id_idx" ON "errands"("status", "courier_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "errands_requester_id_created_at_idx" ON "errands"("requester_id", "created_at");

-- CreateIndex
CREATE INDEX "errand_operations_status_created_at_idx" ON "errand_operations"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "errand_operations_requester_id_idempotency_key_key" ON "errand_operations"("requester_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "errands" ADD CONSTRAINT "errands_pending_operation_id_fkey" FOREIGN KEY ("pending_operation_id") REFERENCES "errand_operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "errands" ADD CONSTRAINT "errands_positive_bounty" CHECK ("offered_credits" BETWEEN 1 AND 2000000000);
ALTER TABLE "errands" ADD CONSTRAINT "errands_open_unassigned" CHECK ("status" <> 'OPEN' OR "courier_id" IS NULL);
ALTER TABLE "errands" ADD CONSTRAINT "errands_mandatory_text" CHECK (char_length(btrim("description")) > 0 AND char_length(btrim("delivery_destination")) > 0 AND char_length(btrim("instructions")) > 0);
CREATE UNIQUE INDEX "errand_operations_one_pending_per_errand" ON "errand_operations"("errand_id") WHERE "status" = 'PENDING';
