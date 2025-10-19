-- Create users table with NARROW columns
-- GenLogic should widen these columns to match the schema
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100),      -- Will be widened to varchar(200)
  code CHAR(10),          -- Will be widened to char(20)
  price NUMERIC(10,2)     -- Will be widened to numeric(12,4)
);
