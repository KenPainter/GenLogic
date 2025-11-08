# Test: CHECK Constraint References Non-Existent Column

This test verifies that the processor detects when a CHECK constraint references a column that doesn't exist.

## Expected Error

```
CHECK constraint in table accounts references non-existent column: nonexistent_col
```

## Input Schema

```yaml
tables:
  accounts:
    columns:
      id: serial primary key
      balance: numeric(12,2)
      credit_limit: numeric(12,2)
    constraints:
      - "balance >= 0"
      - "nonexistent_col IS NOT NULL"
```

## Notes

This test validates:
- CHECK constraints can only reference columns that exist in the table
- The SQL parser extracts column references from the constraint expression
- Non-existent column references are detected and reported
- Error message includes the constraint expression and available columns
- Valid constraints (like `"balance >= 0"`) work correctly

Processing point: schema-populator.ts lines 868-875 (Step 7: Process CHECK constraints)
