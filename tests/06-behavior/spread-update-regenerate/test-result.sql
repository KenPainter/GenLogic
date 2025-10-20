-- Insert event with 5-day range
INSERT INTO events (event_name, start_date, end_date, frequency)
VALUES ('Meeting', '2025-01-01', '2025-01-05', '1 day');

-- Update to extend date range from 5 days to 10 days
-- Should delete old 5 rows and create 10 new rows
UPDATE events SET end_date = '2025-01-10' WHERE event_id = 1;
