# Test: Seed-row Undefined Constant

This test verifies that the processor detects when a seed-row value references an undefined constant.

## Expected Error

```
users seed-row: Undefined constant UNDEFINED_CONST
```

## Input Schema

```yaml
constants:
  DEFAULT_NAME: "Guest"
  DEFAULT_EMAIL: "guest@example.com"

tables:
  users:
    columns:
      id: serial primary key
      name: varchar(100)
      email: varchar(255)
    seed-rows:
      - { id: 1, name: "${DEFAULT_NAME}", email: "${DEFAULT_EMAIL}" }
      - { id: 2, name: "${UNDEFINED_CONST}", email: "bob@example.com" }
```

## Notes

This test validates:
- Constant substitution happens in seed-row values (different code path than column definitions)
- References to undefined constants in seed-rows are detected and reported
- Error message includes context (table and that it's a seed-row)
- Valid constant references (like DEFAULT_NAME) work correctly in seed-rows
- String values in seed-rows can use ${CONSTANT} syntax

Processing point: schema-populator.ts lines 766-767 (Step 4: Process seed-rows, constant substitution)
