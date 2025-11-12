# Test: SUM/COUNT automation requires numeric type

Tests that the processor detects when SUM or COUNT automation is applied to a non-numeric column.

Error catalog reference: `src/new-schema.ts:287`

## Expected Errors

```json
[
  {
    "location": "customers.total_names",
    "message": "SUM automation requires a numeric type, got: character varying"
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
      total_names:
        definition: varchar(500)
        automation: SUM orders.description

  orders:
    columns:
      id: serial primary key
      customer_id: FK(customers)
      description: varchar(200)
```
