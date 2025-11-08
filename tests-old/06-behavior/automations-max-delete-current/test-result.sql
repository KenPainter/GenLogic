-- Insert order
INSERT INTO orders DEFAULT VALUES;

-- Insert items with different prices
INSERT INTO order_items (order_fk, unit_price) VALUES (1, 10.00);
INSERT INTO order_items (order_fk, unit_price) VALUES (1, 25.00);  -- This is the max
INSERT INTO order_items (order_fk, unit_price) VALUES (1, 15.00);

-- Delete the row with the maximum price
DELETE FROM order_items WHERE unit_price = 25.00;

-- Verify max recalculates to next highest (15.00)
SELECT max_price FROM orders WHERE order_id = 1;
