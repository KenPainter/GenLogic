-- Insert accounts
INSERT INTO accounts (account_name) VALUES ('Checking');  -- id = 1
INSERT INTO accounts (account_name) VALUES ('Savings');   -- id = 2

-- Insert transactions in Checking
INSERT INTO transactions (account_fk, amount) VALUES (1, 100.00);
INSERT INTO transactions (account_fk, amount) VALUES (1, 50.00);

-- Move one transaction from Checking to Savings
UPDATE transactions SET account_fk = 2 WHERE amount = 50.00;

-- Verify balances: Checking = 100.00, Savings = 50.00
SELECT account_name, balance FROM accounts ORDER BY account_id;
