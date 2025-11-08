-- This INSERT should fail due to CHECK constraint
INSERT INTO test_numeric (id, distance) VALUES (97, '-Infinity'::double precision);
