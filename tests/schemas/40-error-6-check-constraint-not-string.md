# Test: CHECK Constraint Not a String

This test verifies that the processor detects when a CHECK constraint is not a string expression.

## Expected Error

```
CHECK constraint in table accounts must be a string expression
```

## Input Schema

```yaml
tables:
  accounts:
    columns:
      id: serial primary key
      balance: numeric(12,2)
      status: varchar(20)
    constraints:
      - "balance >= 0"
      - { invalid: "object format" }
```

## Notes

This test validates:
- CHECK constraints must be string expressions (SQL WHERE-like conditions)
- Object/array formats are rejected
- The first constraint `"balance >= 0"` is valid, showing correct format
- Error message identifies which table has the malformed constraint

CHECK constraints use SQL WHERE clause syntax without the WHERE keyword.

Processing point: schema-populator.ts lines 849-851 (Step 7: Process CHECK constraints)
