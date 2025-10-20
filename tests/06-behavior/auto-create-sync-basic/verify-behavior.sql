-- Verify child rows were created and synced correctly
-- After INSERT: 2 rows created
-- After UPDATE: order_id=1 row updated
-- After DELETE: order_id=2 row deleted
-- Result: 1 row remains with updated values
SELECT order_id, audited_customer, audited_total, audit_type
FROM order_audit
ORDER BY order_id;
