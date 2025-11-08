# Test: CHECK Constraint Invalid SQL

This test verifies that the processor detects when a CHECK constraint contains invalid SQL syntax.

## Expected Error

```
Invalid WHERE clause
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
      - "balance < < credit_limit"
```

## Notes

This test validates:
- CHECK constraint expressions must be valid SQL
- The SQL parser validates the constraint syntax
- Invalid operators or syntax (like `< <`) are caught
- Error message includes parser diagnostics
- Valid constraints (like `"balance >= 0"`) work correctly

The constraint is validated by wrapping it as `SELECT * FROM table WHERE <constraint>`
and parsing with pgsql-ast-parser.

Processing point: schema-populator.ts lines 860-865 (Step 7: Process CHECK constraints, parseWhereClause)
