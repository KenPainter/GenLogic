# Test: Aggregate References Non-Existent Child Table

This test verifies that PASS 2 validation detects when a SUM/COUNT/MIN/MAX automation references a table that doesn't exist.

## Expected Error

```
SUM automation in accounts.total_amount references non-existent child table: nonexistent_table
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
        automation: SUM nonexistent_table.amount
```

## Notes

This test validates:
- Aggregate automations (SUM/COUNT/MIN/MAX) must reference tables that exist
- Validation happens in PASS 2 after all tables are populated
- Error message identifies the automation type, parent column, and missing table

Processing point: schema-populator.ts lines 910-916 (PASS 2 validation)
