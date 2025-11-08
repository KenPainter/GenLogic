-- Verify that VARCHAR columns were expanded correctly
SELECT
  column_name,
  data_type,
  character_maximum_length
FROM information_schema.columns
WHERE table_name = 'users'
AND column_name IN ('username', 'email')
ORDER BY column_name;
