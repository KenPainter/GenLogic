-- Create a table that will NOT be in the schema
-- GenLogic should not drop it
CREATE TABLE old_table (
  id SERIAL PRIMARY KEY,
  data VARCHAR(100)
);
