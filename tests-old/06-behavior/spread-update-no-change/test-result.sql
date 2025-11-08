-- Insert event with 3-day range
INSERT INTO events (event_name, description, start_date, end_date, frequency)
VALUES ('Meeting', 'Initial description', '2025-01-01', '2025-01-03', '1 day');

-- Capture occurrence IDs before update
CREATE TEMP TABLE ids_before AS
  SELECT occurrence_id FROM event_occurrences ORDER BY occurrence_id;

-- Update only non-date fields (event_name, description) - should NOT regenerate
UPDATE events SET event_name = 'Updated Meeting', description = 'New description'
WHERE event_id = 1;

-- Capture occurrence IDs after update
CREATE TEMP TABLE ids_after AS
  SELECT occurrence_id FROM event_occurrences ORDER BY occurrence_id;
