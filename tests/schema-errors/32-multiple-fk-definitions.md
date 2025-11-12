# Test: Multiple FK() definitions in one column

Tests that the processor detects when a column has multiple FK() definitions.

Error catalog reference: `src/helpers-processor/definition-parser.ts:67`

## Expected Errors

```json
[
  {
    "location": "orders.customer_id",
    "message": "Multiple FK definitions found - only one FK() allowed per column"
  }
]
```

## Input Schema

```yaml
tables:
  customers:
    columns:
      id: serial primary key
      name: varchar(100)

  users:
    columns:
      id: serial primary key
      username: varchar(50)

  orders:
    columns:
      id: serial primary key
      customer_id: FK(customers) FK(users)
      amount: numeric(12,2)
```
