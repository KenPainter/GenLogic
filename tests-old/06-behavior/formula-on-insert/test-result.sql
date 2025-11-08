-- Insert row - formula should calculate on INSERT
INSERT INTO orders (price, quantity) VALUES (10.50, 3);

-- Verify formula calculated correctly
SELECT total FROM orders WHERE order_id = 1;
