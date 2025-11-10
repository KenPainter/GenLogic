# Test: Undefined constant reference

Tests that the processor detects when a column definition references a constant that doesn't exist.

Error catalog reference: `src/new-schema.ts:90`

## Expected Errors

```json
[
  {
    "location": "users.name.definition",
    "message": "Undefined constant: UNDEFINED_CONST"
  },
  {
    "location": "users.name",
    "message": "Unrecognized SQL modifiers: \"(${UNDEFINED_CONST})\" in definition: varchar(${UNDEFINED_CONST})"
  }
]
```

## Input Schema

```yaml
constants:
  MAX_LENGTH: 100
  DEFAULT_PRECISION: 2

tables:
  users:
    columns:
      id: serial primary key
      name: varchar(${UNDEFINED_CONST})
      email: varchar(${MAX_LENGTH})
```
