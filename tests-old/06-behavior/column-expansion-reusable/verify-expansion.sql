-- Verify that ALL columns using the reusable 'description' were expanded
SELECT
  table_name,
  column_name,
  data_type,
  character_maximum_length
FROM information_schema.columns
WHERE table_name IN ('products', 'categories')
AND column_name IN ('name', 'notes', 'title', 'code', 'abbreviation')
ORDER BY table_name, column_name;
