-- Test weekly interval: 2025-01-01 to 2025-01-22 with 1 week = 4 rows
INSERT INTO schedules (schedule_name, start_date, end_date, frequency)
VALUES ('Weekly Report', '2025-01-01', '2025-01-22', '1 week');

-- Test monthly interval: 2025-01-01 to 2025-04-01 with 1 month = 4 rows
INSERT INTO schedules (schedule_name, start_date, end_date, frequency)
VALUES ('Monthly Review', '2025-01-01', '2025-04-01', '1 month');
