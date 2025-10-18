-- This INSERT should fail due to CHECK constraint
INSERT INTO test_numeric (id, amount) VALUES (99, 'NaN'::numeric);
