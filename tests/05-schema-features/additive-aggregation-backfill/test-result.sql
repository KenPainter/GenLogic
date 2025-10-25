-- Insert new transaction to verify triggers work after backfill
INSERT INTO transactions (id, account_id, amount) VALUES (6, 1, 25.00);
