# Test: FK Definition with Invalid Table Name

This test verifies that the processor detects and rejects FK definitions with invalid table names.

## Expected Error

```
FK definition has invalid table name
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
      parent_id: FK 99invalid_name not null
```

## Notes

This test validates:
- FK table names must follow valid SQL identifier rules
- Table names cannot start with digits
- Other invalid patterns (dots, uppercase, special chars) are also rejected
- The parser uses the validateTableName() function to ensure compliance
