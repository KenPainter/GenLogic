-- This INSERT should fail due to CHECK constraint
INSERT INTO test_numeric (id, amount) VALUES (98, 'Infinity'::numeric);
