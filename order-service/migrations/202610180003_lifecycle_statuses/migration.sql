-- New lifecycle states (D-005..D-007). A value added by ALTER TYPE cannot be used in
-- the transaction that adds it, so the constraints mentioning these values live in
-- the next migration. IN_PROGRESS and EXPIRED stay untouched until Q-006 is answered.
ALTER TYPE "ErrandStatus" ADD VALUE 'PICKED_UP' AFTER 'IN_PROGRESS';
ALTER TYPE "ErrandStatus" ADD VALUE 'DISPUTED' AFTER 'DELIVERED';
