-- Verify regeneration: should have 10 rows (2025-01-01 through 2025-01-10)
SELECT event_id, occurrence_date::text as occurrence_date
FROM event_occurrences
ORDER BY occurrence_date;
