-- Verify that SPREAD automation created 5 child rows with correct dates and master_id FK
SELECT
  master_id,
  spread_date::text as spread_date,
  status
FROM event_spread
ORDER BY spread_date;
