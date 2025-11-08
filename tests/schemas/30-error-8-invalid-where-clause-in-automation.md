# Test: Invalid WHERE Clause in Automation

This test verifies that the processor detects when an automation's WHERE clause contains invalid SQL syntax.

## Expected Error

```
Unexpected op_eq token: "="
```

## Input Schema

```yaml
tables:
  batches:
    columns:
      batch_id: serial primary key

  ledger:
    columns:
      ledger_id: serial primary key
      batch_id: FK batches
      amount: numeric(12,2)

  accounts:
    columns:
      account_id: serial primary key
      balance:
        definition: numeric(12,2)
        automation: "SUM ledger.amount WHERE batch_id = ="
```

## Notes

This test validates:
- WHERE clauses in automation expressions must be valid SQL
- The SQL parser validates WHERE clause syntax
- Invalid SQL operators or syntax are caught during parsing
- Error message includes detailed parser diagnostics with line/column information
- Valid WHERE clauses (like `WHERE batch_id > 0`) would work correctly

Note: The pgsql-ast-parser provides very detailed error messages showing the exact
location of the syntax error and suggesting valid alternatives. We match on a
substring that will always be present in the error.

Processing point: schema-populator.ts lines 320-348
