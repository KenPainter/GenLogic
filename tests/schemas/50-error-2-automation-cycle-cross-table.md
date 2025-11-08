# Test: Automation Cycle Across Tables

This test verifies that PASS 2 cycle detection catches circular dependencies that span across tables using automations and formulas.

## Expected Error

```
Column dependency cycles detected:
```

## Input Schema

```yaml
tables:
  accounts:
    columns:
      account_id: serial primary key
      name: varchar(100)
      total_amount:
        definition: numeric(12,2)
        automation: SUM transactions.adjusted_amount

  transactions:
    columns:
      id: serial primary key
      account_id: FK accounts
      amount: numeric(12,2)
      parent_total:
        definition: numeric(12,2)
        automation: SYNC accounts.total_amount
      adjusted_amount:
        definition: numeric(12,2)
        formula: "amount + parent_total"
```

## Notes

This test validates:
- Automation cycles across tables are detected and rejected
- Cycle path: `accounts.total_amount → transactions.adjusted_amount → transactions.parent_total → accounts.total_amount`
- This would cause infinite trigger recursion in the database
- Breakdown of cycle:
  1. Parent aggregates from child: `accounts.total_amount` SUM `transactions.adjusted_amount`
  2. Child formula uses synced column: `transactions.adjusted_amount = amount + parent_total`
  3. Child syncs from parent: `transactions.parent_total` SYNC `accounts.total_amount`
- Cycle detection happens in PASS 2 using unified edge list (formulas + automations)

Processing point: schema-populator.ts lines 950-970 (PASS 2 cycle detection)
