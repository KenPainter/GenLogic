-- Test that valid numeric values work
INSERT INTO test_numeric (id, amount, price, weight) VALUES (1, 100.50, 200, 15.5);

-- Test that NULL is allowed
INSERT INTO test_numeric (id, amount, price, weight) VALUES (2, NULL, NULL, NULL);

-- Test that negative values work
INSERT INTO test_numeric (id, amount, price, weight) VALUES (3, -50.25, -100, -10.5);
