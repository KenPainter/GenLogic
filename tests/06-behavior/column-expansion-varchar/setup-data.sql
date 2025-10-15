-- Manually alter the table to have smaller VARCHAR size to simulate existing database
-- This simulates a table that was created with VARCHAR(30) but schema now says VARCHAR(60)
ALTER TABLE users ALTER COLUMN username TYPE VARCHAR(30);
ALTER TABLE users ALTER COLUMN email TYPE VARCHAR(50);

-- Insert test data with values that fit in the smaller VARCHAR
INSERT INTO users (username, email) VALUES ('john_doe', 'john@example.com');
INSERT INTO users (username, email) VALUES ('jane_smith', 'jane@example.com');
