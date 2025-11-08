-- Verify that data was preserved after NUMERIC expansion
SELECT product_name, price::text, quantity::text FROM products ORDER BY product_id;
