# Test: Invalid SQL expression

Tests that the processor detects when a SQL expression (formula or check constraint) is invalid.

Error catalog reference: `src/new-schema.ts:681`

## Expected Errors

```json
[
  {
    "location": "orders.total",
    "message": "Invalid SQL expression"
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
        definition: numeric(12,2)
        formula: quantity * )
```
