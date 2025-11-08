-- Verify that composite foreign key columns get a composite index
SELECT json_agg(row_to_json(t)) FROM (
  SELECT
    tablename,
    indexname,
    indexdef
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'order_lines'
    AND indexname LIKE 'idx_%'
  ORDER BY indexname
) t;
