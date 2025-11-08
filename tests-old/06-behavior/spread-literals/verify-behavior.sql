-- Verify literal values were set in all generated child rows
SELECT event_id, occurrence_date::text as occurrence_date, status, priority
FROM event_occurrences
ORDER BY occurrence_date;
