# Test: Formula column cycle detected

Tests that the processor detects cycles in formula column dependencies.

Error catalog reference: `src/processor.ts:141`

## Expected Errors

```json
[
  {
    "location": "Automation dependencies",
    "message": "Cycle detected: orders.total -> orders.tax -> orders.total"
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
        formula: quantity * price + tax
      tax:
        definition: numeric(12,2)
        formula: total * 0.1
```
