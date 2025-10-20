-- Test 1: INSERT creates child row with copy_columns and literals
INSERT INTO orders (customer_name, order_total, status)
VALUES ('Alice', 100.00, 'pending');

INSERT INTO orders (customer_name, order_total, status)
VALUES ('Bob', 200.00, 'pending');

-- Test 2: UPDATE updates child row
UPDATE orders SET customer_name = 'Alice Smith', order_total = 150.00
WHERE order_id = 1;

-- Test 3: DELETE deletes child row
DELETE FROM orders WHERE order_id = 2;
