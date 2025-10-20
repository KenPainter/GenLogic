-- Insert recurring event - should create child rows (filter passes)
INSERT INTO events (event_name, is_recurring, start_date, end_date, frequency)
VALUES ('Weekly Meeting', true, '2025-01-01', '2025-01-03', '1 day');

-- Insert non-recurring event - should NOT create child rows (filter fails)
INSERT INTO events (event_name, is_recurring, start_date, end_date, frequency)
VALUES ('One-time Event', false, '2025-01-01', '2025-01-03', '1 day');
