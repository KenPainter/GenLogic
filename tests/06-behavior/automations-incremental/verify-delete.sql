-- Test DELETE trigger
DELETE FROM transactions WHERE id = 1;
SELECT id, balance FROM accounts WHERE id = 1;
