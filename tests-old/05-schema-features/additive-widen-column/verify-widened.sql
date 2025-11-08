-- Verify that columns were widened
SELECT
  column_name,
  CASE
    WHEN data_type = 'character varying' THEN 'varchar(' || character_maximum_length || ')'
    WHEN data_type = 'character' THEN 'char(' || character_maximum_length || ')'
    WHEN data_type = 'numeric' THEN 'numeric(' || numeric_precision || ',' || numeric_scale || ')'
    ELSE data_type
  END as column_definition
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users' AND column_name IN ('name', 'code', 'price')
ORDER BY column_name;
