-- PostgreSQL requires new enum values to be committed before later migrations use them.
ALTER TYPE "ErrandStatus" ADD VALUE IF NOT EXISTS 'RESOLVED';
ALTER TYPE "OperationKind" ADD VALUE IF NOT EXISTS 'RESOLVE_REFUND';
ALTER TYPE "OperationKind" ADD VALUE IF NOT EXISTS 'RESOLVE_PAY';
