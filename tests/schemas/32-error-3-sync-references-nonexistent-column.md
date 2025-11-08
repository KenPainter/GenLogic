# Test: SYNC References Non-Existent Column (Parent-to-Child)

This test verifies that the processor detects when a SYNC automation references a column that doesn't exist in the parent table.

## Expected Error

```
SYNC automation in ledger.category_copy references non-existent column: batches.nonexistent_category
```

## Input Schema

```yaml
tables:
  batches:
    columns:
      batch_id: serial primary key
      category_name: varchar(50)
      amount: numeric(12,2)

  ledger:
    columns:
      ledger_id: serial primary key
      batch_id: FK batches
      category_copy:
        definition: varchar(50)
        automation: "SYNC batches.nonexistent_category"
```

## Notes

This test validates:
- SYNC automations copy from parent table (parent-to-child direction)
- SYNC can be validated during PASS 1 because parent tables are processed before children
- Referenced parent column must exist in the parent table
- Error message clearly identifies the SYNC column and the missing parent column
- Valid SYNC (like `SYNC batches.category_name`) would work correctly

SYNC/SNAPSHOT are parent-to-child automations that can be validated during PASS 1
because the parent table is always processed before the child table (due to FK ordering).

Processing point: schema-populator.ts PASS 1 (during automation parsing, after parent is processed)
