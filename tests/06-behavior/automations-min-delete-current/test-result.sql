-- Insert order
INSERT INTO orders DEFAULT VALUES;

-- Insert items with different prices
INSERT INTO order_items (order_fk, unit_price) VALUES (1, 25.00);
INSERT INTO order_items (order_fk, unit_price) VALUES (1, 10.00);  -- This is the min
INSERT INTO order_items (order_fk, unit_price) VALUES (1, 15.00);

-- Delete the row with the minimum price
DELETE FROM order_items WHERE unit_price = 10.00;

-- Verify min recalculates to next lowest (15.00)
SELECT min_price FROM orders WHERE order_id = 1;
