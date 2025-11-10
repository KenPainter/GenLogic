# Test: Unknown column property

Tests that the processor detects when a column has an unrecognized property.

Error catalog reference: `src/new-schema.ts:337`

## Expected Errors

```json
[
  {
    "location": "users.name",
    "message": "Unknown column property: invalid_prop"
  }
]
```

## Input Schema

```yaml
tables:
  users:
    columns:
      id: serial primary key
      name:
        definition: varchar(100)
        label: Name
        invalid_prop: some_value
```
