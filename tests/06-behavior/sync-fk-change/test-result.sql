INSERT INTO categories (id, name, tax_rate) VALUES (1, 'Electronics', 8.50);
INSERT INTO categories (id, name, tax_rate) VALUES (2, 'Food', 10.00);
INSERT INTO products (id, category_id, name) VALUES (1, 1, 'Laptop');
-- Change FK - SYNC should re-copy from new parent
UPDATE products SET category_id = 2 WHERE id = 1;
