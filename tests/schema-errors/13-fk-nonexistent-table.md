# Test: FK(references) non-existent table

Tests that the processor detects when a foreign key references a table that doesn't exist.

Error catalog reference: `src/new-schema.ts:414`

## Expected Errors

```json
[
  {
    "location": "orders.customer_id",
    "message": "FK references non-existent table: customers"
  }
]
```

## Input Schema

```yaml
tables:
  orders:
    columns:
      id: serial primary key
      customer_id: FK(customers)
      amount: numeric(12,2)
```
