-- Insert categories
INSERT INTO categories (category_name) VALUES ('Electronics');  -- id = 1
INSERT INTO categories (category_name) VALUES ('Books');        -- id = 2

-- Insert products in Electronics category
INSERT INTO products (category_fk, product_name) VALUES (1, 'Laptop');
INSERT INTO products (category_fk, product_name) VALUES (1, 'Mouse');

-- Move one product from Electronics to Books
UPDATE products SET category_fk = 2 WHERE product_name = 'Mouse';

-- Verify counts: Electronics = 1, Books = 1
SELECT category_name, product_count FROM categories ORDER BY category_id;
