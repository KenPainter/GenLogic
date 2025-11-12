# Test: FK combined with reusable column reference

Tests that the processor detects when a column tries to combine FK() with a reusable column reference.

Error catalog reference: `src/helpers-processor/definition-parser.ts:129`

## Expected Errors

```json
[
  {
    "location": "orders.customer_id",
    "message": "Cannot combine FK with reusable column reference"
  }
]
```

## Input Schema

```yaml
columns:
  price:
    definition: numeric(10,2)

tables:
  customers:
    columns:
      id: serial primary key
      name: varchar(100)

  orders:
    columns:
      id: serial primary key
      customer_id: FK(customers) price
      amount: numeric(12,2)
```
