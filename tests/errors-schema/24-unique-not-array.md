# Test: Unique constraint must be an array

Tests that the processor detects when a unique constraint is not an array of column names.

Error catalog reference: `src/new-schema.ts:899`

## Expected Errors

```json
[
  {
    "location": "users",
    "message": "unique-constraints must be an array"
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
    unique-constraints: email
```
