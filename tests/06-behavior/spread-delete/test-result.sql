-- Insert event with 5-day range (creates 5 child rows)
INSERT INTO events (event_name, start_date, end_date, frequency)
VALUES ('Meeting', '2025-01-01', '2025-01-05', '1 day');

-- Delete parent - should cascade delete all child rows
DELETE FROM events WHERE event_id = 1;
