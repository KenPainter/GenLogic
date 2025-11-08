SELECT
  name,
  description,
  event_date::text,
  event_time::text
FROM events
ORDER BY id;
