# Test: Column has no definition

Tests that the processor detects when a column object has no definition property.

Error catalog reference: `src/new-schema.ts:203`

## Expected Errors

```json
[
  {
    "location": "products.price",
    "message": "Column has no definition"
  }
]
```

## Input Schema

```yaml
tables:
  products:
    columns:
      id: serial primary key
      name: varchar(100)
      price:
        label: Price
        format: currency
```
