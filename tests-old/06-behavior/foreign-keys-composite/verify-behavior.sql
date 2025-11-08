SELECT ol.line_id, ol.product, ol.quantity, oh.customer_name
FROM order_lines ol
JOIN order_headers oh ON ol.order_id = oh.order_id AND ol.order_year = oh.order_year
ORDER BY ol.line_id;
