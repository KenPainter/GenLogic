# Test: Formula References Non-Existent Column

This test verifies that the processor detects when a formula references a column that doesn't exist in the same table.

## Expected Error

```
Formula in accounts.balance references non-existent column: nonexistent_column
```

## Input Schema

```yaml
tables:
  accounts:
    columns:
      id: serial primary key
      debits: numeric(12,2)
      credits: numeric(12,2)
      balance:
        definition: numeric(12,2)
        formula: "debits - nonexistent_column"
```

## Notes

This test validates:
- Formula columns can only reference columns that exist in the same table
- The SQL parser successfully extracts column references from formulas
- Non-existent column references are caught and reported with clear error messages
- Error message identifies both the formula column and the missing column
- Valid formulas (like `debits - credits`) would work correctly

Processing point: schema-populator.ts lines 635-645 (after formula parsing, during edge creation)
