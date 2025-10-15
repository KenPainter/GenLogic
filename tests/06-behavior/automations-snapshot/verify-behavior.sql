SELECT o.id, p.base_price AS current_price, o.price_at_purchase
FROM orders o
JOIN products p ON o.product_id = p.id
ORDER BY o.id;
