# Test: Index references non-existent column

Tests that the processor detects when an index references a column that doesn't exist.

Error catalog reference: `src/new-schema.ts:959`

## Expected Errors

```json
[
  {
    "location": "products.indexes[0]",
    "message": "Index references non-existent column: invalid_col"
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
      category: varchar(50)
    indexes:
      - [invalid_col]
```
