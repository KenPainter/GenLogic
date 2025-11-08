# Test: Unique Constraint Not an Array

This test verifies that the processor detects when a unique constraint is not specified as an array of column names.

## Expected Error

```
Unique constraint in table users must be an array of column names
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
      - username
```

## Notes

This test validates:
- Unique constraints must be arrays (e.g., `[email]` or `[first_name, last_name]`)
- Scalar values (like `username`) are rejected
- The first constraint `[email]` is valid, showing correct format
- Error message identifies which table has the malformed constraint

Note: Even single-column unique constraints must be in array format for consistency.

Processing point: schema-populator.ts lines 789-791 (Step 5: Process unique-constraints)
