# Test: Column Has Both Formula AND Automation

This test verifies that the processor detects when a column has both a formula and an automation, which is not allowed.

## Expected Error

```
Column accounts.total cannot have both formula and automation
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
      debits: numeric(12,2)
      credits: numeric(12,2)
      total:
        definition: numeric(12,2)
        formula: "debits + credits"
        automation: "SUM ledger.amount"
```

## Notes

This test validates:
- A column can have a formula (computed from same-row columns)
- A column can have an automation (computed from cross-table data)
- A column cannot have both formula and automation
- The validation happens during PASS 1 column processing
- Error message clearly identifies which column has the conflict

Formulas and automations are mutually exclusive computation methods.

Processing point: schema-populator.ts lines 628-704 (after parsing both formula and automation)
