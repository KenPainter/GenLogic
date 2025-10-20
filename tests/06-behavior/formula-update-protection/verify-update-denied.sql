-- Verify that UPDATE privilege is NOT granted on formula column
SELECT has_column_privilege('PUBLIC', 'products', 'total', 'UPDATE') as can_update_protected_column;
