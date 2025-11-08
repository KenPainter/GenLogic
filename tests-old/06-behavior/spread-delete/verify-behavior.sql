-- Verify all child rows were deleted
SELECT COUNT(*) as remaining_rows FROM event_occurrences;
