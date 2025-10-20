-- Verify balance was calculated from transactions, not from bogus INSERT value
SELECT id, name, balance,
       (balance = 125.00) as correctly_calculated
FROM accounts WHERE id = 1;
