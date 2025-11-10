# Test: Constraint references non-existent column

Tests that the processor detects when a check constraint references a column that doesn't exist.

Error catalog reference: `src/new-schema.ts:879`

## Expected Errors

```json
[
  {
    "location": "products.constraints[0]",
    "message": "Constraint references non-existent column: invalid_col"
  }
]
```

## Input Schema

```yaml
tables:
  products:
    columns:
      id: serial primary key
      price: numeric(12,2)
    constraints:
      - invalid_col > 0
```
