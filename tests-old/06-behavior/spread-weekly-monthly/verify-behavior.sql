-- Verify weekly and monthly intervals generated correct dates
SELECT schedule_id, occurrence_date::text as occurrence_date
FROM scheduled_occurrences
ORDER BY schedule_id, occurrence_date;
