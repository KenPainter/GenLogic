-- Verify only recurring event created child rows (3 rows for event_id=1, 0 rows for event_id=2)
SELECT event_id, occurrence_date::text as occurrence_date
FROM event_occurrences
ORDER BY event_id, occurrence_date;
