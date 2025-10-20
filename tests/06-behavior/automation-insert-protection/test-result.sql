-- Try to INSERT account with bogus balance
INSERT INTO accounts (id, name, balance) VALUES (1, 'Savings', 999999.99);

-- Add transactions
INSERT INTO transactions (id, account, amount) VALUES (1, 1, 100.00);
INSERT INTO transactions (id, account, amount) VALUES (2, 1, 50.00);
INSERT INTO transactions (id, account, amount) VALUES (3, 1, -25.00);
