-- Create initial schema without aggregation columns
-- This tests backfilling for SUM, COUNT, MAX, and MIN
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  customer_name VARCHAR(100)
);

CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id),
  unit_price NUMERIC(10,2),
  quantity INTEGER
);

-- Insert test data BEFORE aggregation columns exist
INSERT INTO orders (id, customer_name) VALUES
  (1, 'Alice'),
  (2, 'Bob'),
  (3, 'Charlie - No Items');

INSERT INTO order_items (id, order_id, unit_price, quantity) VALUES
  (1, 1, 10.00, 2),
  (2, 1, 15.00, 1),
  (3, 1, 5.00, 3),
  (4, 2, 100.00, 1),
  (5, 2, 25.00, 4);

-- Expected backfilled values:
-- Order 1: item_count=3, total_quantity=6, max_price=15.00, min_price=5.00
-- Order 2: item_count=2, total_quantity=5, max_price=100.00, min_price=25.00
-- Order 3: item_count=0, total_quantity=0, max_price=NULL, min_price=NULL
