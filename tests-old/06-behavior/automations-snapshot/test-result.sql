INSERT INTO products (id, name, base_price) VALUES (1, 'Widget', 50.00);
INSERT INTO orders (id, product_id) VALUES (1, 1);
-- Update product price - order should NOT change (SNAPSHOT freezes value)
UPDATE products SET base_price = 75.00 WHERE id = 1;
