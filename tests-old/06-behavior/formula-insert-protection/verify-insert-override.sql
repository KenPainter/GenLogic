-- Verify formula was calculated correctly despite bogus INSERT value
SELECT id, subtotal, tax, total,
       (total = subtotal + tax) as correctly_calculated
FROM orders WHERE id = 1;
