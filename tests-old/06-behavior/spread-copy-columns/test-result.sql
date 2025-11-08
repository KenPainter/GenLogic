-- Insert project with copy_columns - should spread and copy values to all child rows
INSERT INTO projects (project_name, default_assignee, start_date, end_date, frequency)
VALUES ('Alpha Project', 'Alice', '2025-01-01', '2025-01-03', '1 day');
