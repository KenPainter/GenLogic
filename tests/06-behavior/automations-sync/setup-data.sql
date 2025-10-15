INSERT INTO categories (id, name, tax_rate) VALUES (1, 'Electronics', 8.50);
INSERT INTO products (id, category_id, name) VALUES (1, 1, 'Laptop');
-- Update category tax rate - product should SYNC (automatically update)
UPDATE categories SET tax_rate = 9.25 WHERE id = 1;
