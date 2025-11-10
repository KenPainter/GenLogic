# Test: FK definition missing parent table name

Tests that the processor detects when a foreign key definition is missing the parent table name.

Error catalog reference: `src/new-schema.ts:395`

## Expected Errors

```json
[
  {
    "location": "orders.customer_id",
    "message": "FK definition missing parent table name"
  },
  {
    "location": "orders.customer_id",
    "message": "Invalid SQL definition: ERROR FK definition missing parent table name"
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

  orders:
    columns:
      id: serial primary key
      customer_id: FK
```
