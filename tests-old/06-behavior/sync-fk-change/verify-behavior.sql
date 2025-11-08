SELECT p.id, p.category_id, c.tax_rate AS category_tax_rate, p.category_tax
FROM products p
JOIN categories c ON p.category_id = c.id
ORDER BY p.id;
