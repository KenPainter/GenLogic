-- Verify same occurrence IDs exist (not regenerated)
-- Should show 3 matches if IDs unchanged
SELECT COUNT(*) as unchanged_ids
FROM ids_before b
JOIN ids_after a ON b.occurrence_id = a.occurrence_id;
