# Test: Seed row references non-existent column

Tests that the processor detects when a seed row references a column that doesn't exist.

Error catalog reference: `src/new-schema.ts:846`

## Expected Errors

```json
[
  {
    "location": "users.seed-rows[0]",
    "message": "Seed row references non-existent column: invalid_column"
  }
]
```

## Input Schema

```yaml
tables:
  users:
    columns:
      id: serial primary key
      name: varchar(100)
      email: varchar(100)
    seed-rows:
      - id: 1
        name: Admin
        email: admin@example.com
        invalid_column: bad_value
```
