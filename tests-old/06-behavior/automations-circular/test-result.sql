-- Insert account
INSERT INTO accounts DEFAULT VALUES;  -- id = 1, balance = 0

-- Insert first transaction
INSERT INTO transactions (account_fk, amount) VALUES (1, 100.00);
-- balance becomes 100.00, balance_snapshot captures 0 (value before this transaction)

-- Insert second transaction
INSERT INTO transactions (account_fk, amount) VALUES (1, 50.00);
-- balance becomes 150.00, balance_snapshot captures 100.00 (value before this transaction)

-- Verify no infinite loop occurred
SELECT balance FROM accounts WHERE account_id = 1;
SELECT balance_snapshot FROM transactions ORDER BY transaction_id;
