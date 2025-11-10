# Test: Column cannot have both automation and formula

Tests that the processor detects when a column specifies both automation and formula properties.

Error catalog reference: `src/new-schema.ts:222`

## Expected Errors

```json
[
  {
    "location": "orders.total",
    "message": "Column cannot have both automation and formula"
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
      customer_id: FK customers
      quantity: integer
      total:
        definition: numeric(12,2)
        formula: quantity * 10
        automation: SUM line_items.amount
```
