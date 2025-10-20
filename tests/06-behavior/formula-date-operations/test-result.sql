-- Insert subscription with 30 day duration
INSERT INTO subscriptions (start_date, duration_days)
VALUES ('2024-01-01', 30);

-- Verify end_date calculated correctly
SELECT end_date FROM subscriptions WHERE subscription_id = 1;
