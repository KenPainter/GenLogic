# Test: Index must be an array

Tests that the processor detects when an index is not an array of column names.

Error catalog reference: `src/new-schema.ts:940`

## Expected Errors

```json
[
  {
    "location": "products",
    "message": "indexes must be an array"
  },
  {
    "location": "table2.indexes[0]",
    "message": "Index must be an array of column names"
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
    indexes: name
  table2:
    columns:
      id: serial primary key
      name: varchar(100)
      category: varchar(50)
    indexes: 
      - name

```
