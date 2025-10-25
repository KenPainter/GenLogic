-- Create sales table with existing data BEFORE the global totals table exists
-- This simulates adding a singleton aggregation table to an existing system
CREATE TABLE sales (
  id SERIAL PRIMARY KEY,
  amount NUMERIC(10,2),
  sale_date DATE
);

-- Insert test data BEFORE global_totals exists
INSERT INTO sales (id, amount, sale_date) VALUES
  (1, 100.00, '2024-01-01'),
  (2, 250.50, '2024-01-02'),
  (3, 75.25, '2024-01-03'),
  (4, 500.00, '2024-01-04'),
  (5, 99.99, '2024-01-05');

-- Expected: global_totals.total_sales should be 1025.74 after backfill
