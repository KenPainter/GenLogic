SELECT p.name, p.price, c.name as category
FROM products p
JOIN categories c ON p.category_id = c.id
ORDER BY p.name;
