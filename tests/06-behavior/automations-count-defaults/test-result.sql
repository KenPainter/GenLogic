-- Insert category with no products
INSERT INTO categories DEFAULT VALUES;

-- Verify count defaults to 0
SELECT product_count FROM categories WHERE category_id = 1;
