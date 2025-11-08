-- Simulate existing database with smaller VARCHAR(50) for description columns
-- This represents the state BEFORE the user changed the reusable column from 50 to 120

-- Shrink all description columns to VARCHAR(50) to simulate old state
ALTER TABLE products ALTER COLUMN name TYPE VARCHAR(50);
ALTER TABLE products ALTER COLUMN notes TYPE VARCHAR(50);
ALTER TABLE categories ALTER COLUMN title TYPE VARCHAR(50);

-- Insert test data that fits in VARCHAR(50)
INSERT INTO products (name, notes, code) VALUES
  ('Widget Pro', 'Premium quality widget', 'WGT001'),
  ('Gadget Max', 'Advanced gadget system', 'GAD001');

INSERT INTO categories (title, abbreviation) VALUES
  ('Electronics', 'ELEC'),
  ('Home & Garden', 'HOME');
