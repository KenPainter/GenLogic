-- Create users table with an extra column (email) that will NOT be in the schema
-- GenLogic should not drop the email column
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100),
  email VARCHAR(255)
);
