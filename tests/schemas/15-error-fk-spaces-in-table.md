# Test: FK Definition with Spaces in Table Name

This test verifies that the processor detects and rejects FK definitions with spaces in the table name (which are invalid in SQL identifiers without quotes).

## Expected Error

```
FK definition has unexpected text after patterns
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
      parent_id: FK parent table name with spaces delete cascade
```

## Notes

This test validates:
- FK definitions cannot have spaces in table names (unless quoted, which we don't support)
- The parser detects unexpected text after removing valid patterns
- After removing "delete cascade", "parent table name with spaces" contains spaces and is rejected
