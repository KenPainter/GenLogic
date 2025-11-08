-- Insert event with literals - should spread and set literal values in all child rows
INSERT INTO events (event_name, start_date, end_date, frequency)
VALUES ('Team Meeting', '2025-01-01', '2025-01-03', '1 day');
