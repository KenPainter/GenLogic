# Test: Column has no definition and no matching reusable column

Tests that the processor detects when a column has neither a definition nor a matching reusable column.

Error catalog reference: `src/new-schema.ts:153`

## Expected Errors

```json
[
  {
    "location": "users.status",
    "message": "Column has no definition"
  }
]
```

## Input Schema

```yaml
columns:
  amount:
    definition: numeric(12,2)
    format: currency

tables:
  users:
    columns:
      id: serial primary key
      name: varchar(100)
      status:
        label: Status
        format: uppercase
```
