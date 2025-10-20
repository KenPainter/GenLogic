-- Insert order
INSERT INTO orders DEFAULT VALUES;

-- Insert items
INSERT INTO order_items (order_fk, unit_price) VALUES (1, 10.00);
INSERT INTO order_items (order_fk, unit_price) VALUES (1, 25.00);

-- Delete all items
DELETE FROM order_items WHERE order_fk = 1;

-- Verify max returns to NULL
SELECT max_price FROM orders WHERE order_id = 1;
