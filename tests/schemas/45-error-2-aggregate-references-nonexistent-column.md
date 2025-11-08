# Test: Aggregate References Non-Existent Column in Child Table

This test verifies that PASS 2 validation detects when a SUM/COUNT/MIN/MAX automation references a column that doesn't exist in the child table.

## Expected Error

```
SUM automation in accounts.total_amount references non-existent column in child table transactions: nonexistent_column
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
        automation: SUM transactions.nonexistent_column

  transactions:
    columns:
      id: serial primary key
      account_id: FK accounts
      amount: numeric(12,2)
```

## Notes

This test validates:
- Aggregate automations must reference columns that exist in the child table
- Validation is deferred to PASS 2 because child tables may not be fully populated during PASS 1
- Error message identifies the parent column, child table, and missing column

Processing point: schema-populator.ts lines 918-923 (PASS 2 validation)
