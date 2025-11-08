# Test: Aggregate WHERE Clause References Non-Existent Column

This test verifies that PASS 2 validation detects when a WHERE clause in a SUM/COUNT/MIN/MAX automation references a column that doesn't exist in the child table.

## Expected Error

```
WHERE clause in accounts.debit_total references non-existent column in transactions: nonexistent_column
```

## Input Schema

```yaml
tables:
  accounts:
    columns:
      account_id: serial primary key
      name: varchar(100)
      debit_total:
        definition: numeric(12,2)
        automation: SUM transactions.amount WHERE nonexistent_column = 'debit'

  transactions:
    columns:
      id: serial primary key
      account_id: FK accounts
      amount: numeric(12,2)
      type: varchar(10)
```

## Notes

This test validates:
- WHERE clauses in aggregate automations must reference columns that exist in the child table
- WHERE clause columns are parsed and validated separately from the target column
- Validation is deferred to PASS 2 after all tables are populated

Processing point: schema-populator.ts lines 925-935 (PASS 2 validation)
