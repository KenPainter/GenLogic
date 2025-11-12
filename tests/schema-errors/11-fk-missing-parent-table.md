# Test: FK(definition) missing parent table name

Tests that the processor detects when a foreign key definition is missing the parent table name.

Error catalog reference: `src/new-schema.ts:395`

## Expected Errors

```json
[
  {
    "location": "orders.customer_id",
    "message": "Unknown PostgreSQL type: fk - do you need to define a reusable column 'fk'?"
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
