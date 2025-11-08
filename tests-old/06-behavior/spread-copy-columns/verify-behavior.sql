-- Verify copy_columns values were copied to all generated child rows
SELECT project_id, task_date::text as task_date, task_prefix, assignee
FROM tasks
ORDER BY task_date;
