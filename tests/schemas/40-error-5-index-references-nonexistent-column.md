# Test: Index References Non-Existent Column

This test verifies that the processor detects when an index references a column that doesn't exist.

## Expected Error

```
Index in table users references non-existent column: nonexistent_col
```

## Input Schema

```yaml
tables:
  users:
    columns:
      id: serial primary key
      name: varchar(100)
      email: varchar(255)
      created_at: timestamp
    indexes:
      - [email]
      - [name, nonexistent_col]
```

## Notes

This test validates:
- All columns in an index must exist in the table
- Multi-column indexes are validated column-by-column
- Error message identifies the table and the missing column
- Valid indexes (like `[email]`) work correctly
- Provides list of available columns for user reference

Processing point: schema-populator.ts lines 823-830 (Step 6: Process indexes)
