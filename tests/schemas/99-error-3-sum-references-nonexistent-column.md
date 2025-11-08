# Test: SUM References Non-Existent Column (Child-to-Parent)

This test verifies that the processor detects when a SUM automation references a column that doesn't exist in the child table.

## Expected Error

```
SUM automation in accounts.total references non-existent column in child table ledger: nonexistent_column
```

## Input Schema

```yaml
tables:
  ledger:
    columns:
      ledger_id: serial primary key
      account_id: integer
      amount: numeric(12,2)

  accounts:
    columns:
      id: serial primary key
      total:
        definition: numeric(12,2)
        automation: "SUM ledger.nonexistent_column"
```

## Notes

This test validates:
- SUM/COUNT/MIN/MAX automations aggregate from child table (child-to-parent direction)
- These cannot be validated during PASS 1 because tables may be processed in any order within a layer
- Validation happens in PASS 2 after all tables are processed
- Referenced child column must exist in the child table
- Error message clearly identifies the aggregation column and the missing child column
- Valid aggregations (like `SUM ledger.amount`) would work correctly

Child-to-parent automations (SUM, COUNT, MIN, MAX) must be validated in PASS 2
because the child table may not be processed yet when we encounter the automation.

Processing point: schema-populator.ts PASS 2 (after all tables processed, before cycle detection)
