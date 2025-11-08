# Test: Invalid Formula Expression

This test verifies that the processor detects when a formula expression contains invalid SQL syntax.

## Expected Error

```
Syntax error
```

## Input Schema

```yaml
tables:
  accounts:
    columns:
      id: serial primary key
      debits: numeric(12,2)
      credits: numeric(12,2)
      balance:
        definition: numeric(12,2)
        formula: "debits * / credits"
```

## Notes

This test validates:
- Formula expressions must be valid SQL expressions
- The SQL parser (pgsql-ast-parser) validates syntax
- Invalid operator sequences (like `* /`) are caught
- Error message includes the parser error and the expression
- Valid formulas (like `debits - credits` or `debits * credits`) would work correctly

Note: Many seemingly invalid expressions are actually valid SQL:
- `debits - - credits` is valid (unary minus)
- `debits credits` is valid (two columns in SELECT list)
- `debits + + credits` is valid (unary plus)
- But `debits * / credits` is genuinely invalid (consecutive binary operators)

Processing point: schema-populator.ts lines 291-315
