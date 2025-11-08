-- Try to INSERT with bogus total value
INSERT INTO orders (id, subtotal, tax, total) VALUES (1, 100.00, 10.00, 999.99);
