# Test: Seed-row References Non-Existent Column

This test verifies that the processor detects when a seed-row references a column that doesn't exist in the table.

## Expected Error

```
Seed-row in table users references non-existent column: invalid_col
```

## Input Schema

```yaml
tables:
  users:
    columns:
      id: serial primary key
      name: varchar(100)
      email: varchar(255)
    seed-rows:
      - { id: 1, name: Alice, email: alice@example.com }
      - { id: 2, name: Bob, invalid_col: value }
```

## Notes

This test validates:
- Seed-rows can only reference columns that exist in the table
- Each column name in a seed-row is validated against the table's column list
- Error message clearly identifies the table and the non-existent column
- Valid seed-rows (first row) work correctly alongside the invalid one

Processing point: schema-populator.ts lines 773-778 (Step 4: Process seed-rows)
