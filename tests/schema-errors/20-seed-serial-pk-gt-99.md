# Test: Seed row serial PK value > 99

Tests that the processor rejects seed rows with serial primary key values > 99.
Serial sequences start at 100, so seed data must use values <= 99 to avoid collisions.

Error catalog reference: `src/new-schema.ts:1032`

## Expected Errors

```json
[
  {
    "location": "products.seed-rows[0].product_id",
    "message": "Seed row primary key value must be <= 99 for serial columns (got 100). Serial sequences start at 100."
  },
  {
    "location": "products.seed-rows[2].product_id",
    "message": "Seed row primary key value must be <= 99 for serial columns (got 150). Serial sequences start at 100."
  }
]
```

## Input Schema

```yaml
tables:
  products:
    columns:
      product_id: serial primary key
      name: varchar(100)
    seed-rows:
      - product_id: 100
        name: Invalid Product (at boundary)
      - product_id: 1
        name: Valid Product
      - product_id: 150
        name: Invalid Product (above boundary)
```
