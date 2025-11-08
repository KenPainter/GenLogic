# Test: FK Definition with Invalid Keyword

This test verifies that the processor detects and rejects FK definitions with invalid keywords.

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
      parent_id: FK parent_table not null delete have-a-party
```

## Notes

This test validates:
- FK definitions with nonsense keywords (like "have-a-party") are rejected
- The parser correctly identifies invalid text after valid patterns
- Error messages help users identify the problematic FK definition
