# Test: Circular constant reference

Tests that the processor detects circular references between constants.

Error catalog reference: `src/helpers-processor/constant-resolver.ts:65`

## Expected Errors

```json
[
  {
    "location": "Constants",
    "message": "Cycle detected: CONST_A -> CONST_B -> CONST_A"
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
