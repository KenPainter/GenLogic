# Test: Undefined Constant in Column Definition

This test verifies that the processor detects when a column definition references a constant that doesn't exist.

## Expected Error

```
users.name definition: Undefined constant UNDEFINED_CONSTANT
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
      name: varchar(${UNDEFINED_CONSTANT})
      email: varchar(${MAX_LENGTH})
```

## Notes

This test validates:
- Constant substitution happens during PASS 1 column processing
- References to undefined constants are detected and reported
- The error message includes context (table.column and which constant is undefined)
- Valid constant references (like MAX_LENGTH) work correctly

Processing point: schema-populator.ts lines 157-172, 599-605
