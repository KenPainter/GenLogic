SELECT o.order_id, o.customer_id, o.discount_group_id, o.discount_percent,
       c.discount_group_id AS customer_group_id,
       dg.discount_percent AS current_group_discount
FROM orders o
JOIN customers c ON o.customer_id = c.customer_id
LEFT JOIN discount_groups dg ON o.discount_group_id = dg.group_id
ORDER BY o.order_id;
