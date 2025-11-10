# Test: FK parent table has no primary key

Tests that the processor detects when a foreign key references a table that has no primary key.

Error catalog reference: `src/new-schema.ts:426`

## Expected Errors

```json
[
  {
    "location": "orders.customer_id",
    "message": "FK references table customers which has no primary key"
  },
  {
    "location": "orders.customer_id",
    "message": "Invalid SQL definition: ERROR due to no primary key in customers, this definition could not be inferred"
  }
]
```

## Input Schema

```yaml
tables:
  customers:
    columns:
      customer_num: integer
      name: varchar(100)

  orders:
    columns:
      id: serial primary key
      customer_id: FK customers
      amount: numeric(12,2)
```
