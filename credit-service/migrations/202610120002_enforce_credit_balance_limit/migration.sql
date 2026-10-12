ALTER TABLE "credit_accounts"
ADD CONSTRAINT "credit_accounts_available_within_limit"
CHECK ("available_credits" <= 10000000),
ADD CONSTRAINT "credit_accounts_reserved_within_limit"
CHECK ("reserved_credits" <= 10000000);

ALTER TABLE "credit_reservations"
ADD CONSTRAINT "credit_reservations_amount_within_limit"
CHECK ("amount" <= 10000000);

ALTER TABLE "ledger_entries"
ADD CONSTRAINT "ledger_entries_amount_within_limit"
CHECK ("amount" <= 10000000),
ADD CONSTRAINT "ledger_entries_available_balance_within_limit"
CHECK ("available_balance_after" <= 10000000),
ADD CONSTRAINT "ledger_entries_reserved_balance_within_limit"
CHECK ("reserved_balance_after" <= 10000000);

ALTER TABLE "credit_reservation_adjustments"
ADD CONSTRAINT "credit_reservation_adjustments_previous_amount_within_limit"
CHECK ("previous_amount" <= 10000000),
ADD CONSTRAINT "credit_reservation_adjustments_target_amount_within_limit"
CHECK ("target_amount" <= 10000000);
