# Test: Unknown reusable column base

Tests that the processor detects when a column references a non-existent reusable column.

Error catalog reference: `src/new-schema.ts:180`

## Expected Errors

```json
[
  {
    "location": "users.balance",
    "message": "Unknown PostgreSQL type: price - do you need to define a reusable column 'price'?"
  }
]
```

## Input Schema

```yaml
columns:
  amount:
    definition: numeric(12,2)
    format: currency

tables:
  users:
    columns:
      id: serial primary key
      balance: price
```
