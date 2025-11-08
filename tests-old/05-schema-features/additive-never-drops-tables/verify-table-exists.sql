-- Verify that old_table still exists after GenLogic runs
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'old_table';
