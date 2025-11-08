# Test: Invalid Automation Expression Format

This test verifies that the processor detects when an automation expression doesn't match the expected pattern.

## Expected Error

```
Invalid automation expression in accounts.total: SUM FROM ledger.amount
Expected format: TYPE[(fkColumn)] targetTable.targetColumn [WHERE condition]
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
        automation: "SUM FROM ledger.amount"
```

## Notes

This test validates:
- Automation expressions must follow the expected pattern
- Valid formats include: `SUM table.column`, `SUM(fk) table.column`, `SYNC table.column`
- Keywords like "FROM" are not part of the automation DSL
- Error message shows the expected format for user guidance
- Valid automation (like `SUM ledger.amount`) would work correctly

Processing point: schema-populator.ts lines 363-377
