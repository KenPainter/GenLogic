# Test: FK cycle detected

Tests that the processor detects cycles in foreign key relationships.

Error catalog reference: `src/processor.ts:121`

## Expected Errors

```json
[
  {
    "location": "Foreign keys",
    "message": "Cycle detected: orders -> users -> orders"
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
      current_order_id: FK orders

  orders:
    columns:
      id: serial primary key
      user_id: FK users
      amount: numeric(12,2)
```
