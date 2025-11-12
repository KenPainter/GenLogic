# Test: Unknown table property

Tests that the processor detects when a table has an unrecognized property.

Error catalog reference: `src/new-schema.ts:825`

## Expected Errors

```json
[
  {
    "location": "users",
    "message": "Unknown table property: invalid_property, valid keys: columns, seed-rows, constraints, unique-constraints, indexes"
  }
]
```

## Input Schema

```yaml
tables:
  users:
    invalid_property: some_value
    columns:
      id: serial primary key
      name: varchar(100)
```
