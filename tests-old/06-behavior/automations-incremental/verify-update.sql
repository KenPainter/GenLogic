-- Test UPDATE trigger
UPDATE transactions SET amount = 75.00 WHERE id = 2;
SELECT id, balance FROM accounts WHERE id = 1;
