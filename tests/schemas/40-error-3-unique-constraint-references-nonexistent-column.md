# Test: Unique Constraint References Non-Existent Column

This test verifies that the processor detects when a unique constraint references a column that doesn't exist.

## Expected Error

```
Unique constraint in table users references non-existent column: nonexistent_col
```

## Input Schema

```yaml
tables:
  users:
    columns:
      id: serial primary key
      email: varchar(255)
      username: varchar(50)
    unique-constraints:
      - [email]
      - [email, nonexistent_col]
```

## Notes

This test validates:
- All columns in a unique constraint must exist in the table
- Multi-column unique constraints are validated column-by-column
- Error message identifies the table and the missing column
- Valid constraints (like `[email]`) work correctly
- Provides list of available columns for user reference

Processing point: schema-populator.ts lines 794-801 (Step 5: Process unique-constraints)
