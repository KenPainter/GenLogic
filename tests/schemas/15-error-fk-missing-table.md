# Test: FK Definition Missing Parent Table

This test verifies that the processor detects and rejects FK definitions that have valid keywords but no parent table reference.

## Expected Error

```
FK definition missing parent table after removing patterns
```

## Input Schema

```yaml
tables:
  parent_table:
    columns:
      parent_id: serial primary key
      name: varchar(100)

  child_table:
    columns:
      child_id: serial primary key
      parent_id: FK not null delete cascade
```

## Notes

This test validates:
- FK definitions must specify a parent table reference
- Valid keywords alone (not null, delete cascade) are not sufficient
- The parser correctly identifies when the table reference is missing
