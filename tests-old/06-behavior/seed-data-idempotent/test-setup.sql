-- Pre-insert one of the seed-rows to test idempotent behavior
CREATE TABLE currencies (
  code VARCHAR(3) PRIMARY KEY,
  name VARCHAR(50),
  symbol VARCHAR(5)
);

INSERT INTO currencies (code, name, symbol) VALUES ('USD', 'US Dollar', '$');
