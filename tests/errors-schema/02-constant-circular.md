# Test: Circular constant reference

Tests that the processor detects circular references between constants.

Error catalog reference: `src/new-schema.ts:104`

## Expected Errors

```json
[
  {
    "location": "users.limit_val.definition",
    "message": "Circular constant reference detected"
  }
]
```

## Input Schema

```yaml
constants:
  CONST_A: ${CONST_B}
  CONST_B: ${CONST_A}

tables:
  users:
    columns:
      id: serial primary key
      limit_val: integer default ${CONST_A}
```
