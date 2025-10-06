SELECT COUNT(*)
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'test_dryrun_table';
