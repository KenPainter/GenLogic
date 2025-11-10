# Test: Invalid SQL definition

Tests that the processor detects when a SQL definition string is invalid.

Error catalog reference: `src/new-schema.ts:525`

## Expected Errors

```json
[
  {
    "location": "users.status",
    "message": "Invalid SQL definition: invalid"
  }
]
```

## Input Schema

```yaml
tables:
  users:
    columns:
      id: serial primary key
      status: invalid
```
