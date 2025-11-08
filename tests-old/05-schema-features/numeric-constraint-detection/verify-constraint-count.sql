-- Verify we have exactly 4 CHECK constraints (one per numeric column)
SELECT COUNT(*) as constraint_count
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
WHERE con.contype = 'c'
  AND rel.relname IN ('accounts', 'transactions')
  AND con.conname LIKE '%_check';
