# Test: Parent Table Has No Primary Key

This test verifies that the processor detects when trying to infer an FK column definition from a parent table that has no primary key.

## Expected Error

```
Cannot infer definition for child_table.parent_id: parent table parent_table has no primary key
```

## Input Schema

```yaml
tables:
  parent_table:
    columns:
      id: integer
      name: varchar(100)
      description: text

  child_table:
    columns:
      id: serial primary key
      parent_id: FK parent_table
      name: varchar(100)
```

## Notes

This test validates:
- FK definition inference requires parent table to have a primary key
- Parent tables with only regular columns (no PK) are detected
- Error message clearly identifies which child column and parent table are affected
- This is checked during PASS 1 layer-by-layer processing

Processing point: schema-populator.ts lines 579-584
