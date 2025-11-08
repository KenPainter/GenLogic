-- Manually alter the table to have smaller NUMERIC precision/scale to simulate existing database
-- This simulates a table that was created with NUMERIC(10,2) but schema now says NUMERIC(12,4)
ALTER TABLE products ALTER COLUMN price TYPE NUMERIC(10,2);

-- Insert test data with values that fit in the smaller NUMERIC
INSERT INTO products (product_name, price, quantity) VALUES ('Widget', 99.99, 10.00);
INSERT INTO products (product_name, price, quantity) VALUES ('Gadget', 149.50, 25.50);
