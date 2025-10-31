-- Create a batch
INSERT INTO batches (batch_id, name) VALUES (1, 'Batch 1');

-- Insert ledger transactions
-- Some with offset account (assigned), some without (unassigned)
INSERT INTO ledger (ledger_id, batch_id, amount, account_id_offset) VALUES (1, 1, 100.00, 5);  -- assigned
INSERT INTO ledger (ledger_id, batch_id, amount, account_id_offset) VALUES (2, 1, 50.00, NULL);  -- unassigned
INSERT INTO ledger (ledger_id, batch_id, amount, account_id_offset) VALUES (3, 1, 75.00, 6);    -- assigned
INSERT INTO ledger (ledger_id, batch_id, amount, account_id_offset) VALUES (4, 1, 25.00, NULL);  -- unassigned

-- Test UPDATE: transition from unassigned to assigned
UPDATE ledger SET account_id_offset = 7 WHERE ledger_id = 2;

-- Test UPDATE: transition from assigned to unassigned
UPDATE ledger SET account_id_offset = NULL WHERE ledger_id = 3;

-- Test DELETE of assigned row
DELETE FROM ledger WHERE ledger_id = 1;
