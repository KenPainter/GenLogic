-- Verify all numeric columns have CHECK constraints with correct naming
SELECT
  con.conrelid::regclass AS table_name,
  att.attname AS column_name,
  con.conname AS constraint_name,
  pg_get_constraintdef(con.oid) AS constraint_definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
WHERE con.contype = 'c'
  AND rel.relname IN ('accounts', 'transactions')
  AND con.conname LIKE '%_check'
ORDER BY table_name, column_name;
