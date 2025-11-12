# Test: Multiple reusable column references in one column

Tests that the processor detects when a column references multiple reusable columns.

Error catalog reference: `src/helpers-processor/definition-parser.ts:102`

## Expected Errors

```json
[
  {
    "location": "products.cost",
    "message": "Multiple reusable column references found: price, quantity"
  }
]
```

## Input Schema

```yaml
columns:
  price:
    definition: numeric(10,2)

  quantity:
    definition: integer

tables:
  products:
    columns:
      id: serial primary key
      name: varchar(100)
      cost: price quantity
```
