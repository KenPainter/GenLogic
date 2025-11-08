# Test: WHERE Clause References Non-Existent Column

This test verifies that the processor detects when an automation's WHERE clause references a column that doesn't exist in the target table.

## Expected Error

```
WHERE clause in accounts.active_total references non-existent column in ledger: status
```

## Input Schema

```yaml
tables:
  ledger:
    columns:
      ledger_id: serial primary key
      account_id: integer
      amount: numeric(12,2)
      active: boolean

  accounts:
    columns:
      id: serial primary key
      active_total:
        definition: numeric(12,2)
        automation: "SUM ledger.amount WHERE status = 'active'"
```

## Notes

This test validates:
- WHERE clauses in automations must reference columns that exist in the target table
- The SQL parser successfully extracts column names from WHERE expressions
- Non-existent column references in WHERE are caught and reported clearly
- Error message identifies the automation column, target table, and missing column
- Valid WHERE clauses (like `WHERE active = true`) would work correctly

WHERE clause validation happens in PASS 2 (after all tables processed) because
the target table may not be processed yet during PASS 1.

Processing point: schema-populator.ts PASS 2 (during automation validation, after target table lookup)
