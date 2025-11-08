-- Test that valid numeric values work
INSERT INTO test_numeric (id, amount, price, weight, distance, cost) VALUES (1, 100.50, 200, 15.5, 99.9, 1000);

-- Test that NULL is allowed
INSERT INTO test_numeric (id, amount, price, weight, distance, cost) VALUES (2, NULL, NULL, NULL, NULL, NULL);

-- Test that negative values work
INSERT INTO test_numeric (id, amount, price, weight, distance, cost) VALUES (3, -50.25, -100, -10.5, -5.5, -20);
