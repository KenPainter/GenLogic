-- Verify that indexes are created for foreign key columns
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'posts'
  AND indexname LIKE 'idx_%'
ORDER BY indexname;
