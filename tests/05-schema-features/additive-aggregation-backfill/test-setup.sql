-- Create initial schema without aggregation columns
-- This simulates an existing database with data before adding aggregations
CREATE TABLE accounts (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100)
);

CREATE TABLE transactions (
  id SERIAL PRIMARY KEY,
  account_id INTEGER REFERENCES accounts(id),
  amount NUMERIC(10,2)
);

-- Insert test data BEFORE aggregation columns exist
INSERT INTO accounts (id, name) VALUES
  (1, 'Checking'),
  (2, 'Savings'),
  (3, 'Empty Account');

INSERT INTO transactions (id, account_id, amount) VALUES
  (1, 1, 100.00),
  (2, 1, -25.50),
  (3, 1, 50.00),
  (4, 2, 1000.00),
  (5, 2, -200.00);

-- Expected backfilled values:
-- Account 1 should have balance: 124.50, transaction_count: 3
-- Account 2 should have balance: 800.00, transaction_count: 2
-- Account 3 should have balance: 0.00, transaction_count: 0
