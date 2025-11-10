# Test: Formula columns cannot have defaults

Tests that the processor detects when a formula column specifies a default value.

Error catalog reference: `src/new-schema.ts:258`

## Expected Errors

```json
[
  {
    "location": "orders.total",
    "message": "Formula columns cannot have defaults - the value is calculated from other columns. Remove the 'default' specification."
  }
]
```

## Input Schema

```yaml
tables:
  orders:
    columns:
      id: serial primary key
      quantity: integer
      price: numeric(12,2)
      total:
        definition: numeric(12,2) default 0
        formula: quantity * price
```
