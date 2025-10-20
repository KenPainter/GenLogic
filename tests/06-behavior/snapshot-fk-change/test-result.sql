INSERT INTO products (id, name, base_price) VALUES (1, 'Product A', 100.00);
INSERT INTO products (id, name, base_price) VALUES (2, 'Product B', 200.00);
INSERT INTO orders (id, product_id) VALUES (1, 1);
-- Change FK - SNAPSHOT should re-copy from new parent
UPDATE orders SET product_id = 2 WHERE id = 1;
