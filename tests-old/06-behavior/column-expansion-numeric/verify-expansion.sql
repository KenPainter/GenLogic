-- Verify that NUMERIC columns were expanded correctly
SELECT
  column_name,
  data_type,
  numeric_precision,
  numeric_scale
FROM information_schema.columns
WHERE table_name = 'products'
AND column_name IN ('price', 'quantity')
ORDER BY column_name;
