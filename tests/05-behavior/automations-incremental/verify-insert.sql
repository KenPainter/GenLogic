-- Test INSERT trigger
INSERT INTO transactions (id, account_id, amount) VALUES (3, 1, 25.00);
SELECT id, balance FROM accounts WHERE id = 1;
