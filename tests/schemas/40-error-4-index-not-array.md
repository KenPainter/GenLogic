# Test: Index Not an Array

This test verifies that the processor detects when an index is not specified as an array of column names.

## Expected Error

```
Index in table users must be an array of column names
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
      - name
```

## Notes

This test validates:
- Indexes must be arrays (e.g., `[email]` or `[last_name, first_name]`)
- Scalar values (like `name`) are rejected
- The first index `[email]` is valid, showing correct format
- Error message identifies which table has the malformed index

Note: Even single-column indexes must be in array format for consistency.

Processing point: schema-populator.ts lines 818-820 (Step 6: Process indexes)
