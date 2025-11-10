# Test: Unrecognized SQL modifiers

Tests that the processor detects when a SQL definition contains unrecognized modifiers.

Error catalog reference: `src/new-schema.ts:594`

## Expected Errors

```json
[
  {
    "location": "users.name",
    "message": "Unrecognized SQL modifiers: \"bad_modifier\" in definition: varchar(100) bad_modifier"
  }
]
```

## Input Schema

```yaml
tables:
  users:
    columns:
      id: serial primary key
      name: varchar(100) bad_modifier
```
