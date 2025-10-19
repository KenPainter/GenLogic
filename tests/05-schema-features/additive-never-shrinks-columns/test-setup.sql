-- Create users table with LARGER columns than the schema will specify
-- GenLogic should not shrink these columns
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200),     -- Schema will have varchar(50) but GenLogic never shrinks
  code CHAR(20),          -- Schema will have char(5) but GenLogic never shrinks
  price NUMERIC(12,4)     -- Schema will have numeric(8,2) but GenLogic never shrinks
);
