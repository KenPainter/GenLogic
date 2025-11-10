# Test: Unique constraint references non-existent column

Tests that the processor detects when a unique constraint references a column that doesn't exist.

Error catalog reference: `src/new-schema.ts:918`

## Expected Errors

```json
[
  {
    "location": "users.unique-constraints[0]",
    "message": "Unique constraint references non-existent column: invalid_col"
  }
]
```

## Input Schema

```yaml
tables:
  users:
    columns:
      id: serial primary key
      email: varchar(100)
      username: varchar(50)
    unique-constraints:
      - [email, invalid_col]
```
