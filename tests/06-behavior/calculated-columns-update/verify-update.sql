-- Update base_price and verify final_price recalculates
UPDATE products SET base_price = 150.00 WHERE id = 1;
SELECT id, base_price, markup, final_price FROM products WHERE id = 1;
